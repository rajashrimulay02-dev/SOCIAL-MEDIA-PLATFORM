const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const db = new Database('social.db');

// ---------- Database tables ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, bio TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS comments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL, content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS likes(
  user_id INTEGER NOT NULL, post_id INTEGER NOT NULL,
  PRIMARY KEY(user_id, post_id));
CREATE TABLE IF NOT EXISTS followers(
  follower_id INTEGER NOT NULL, following_id INTEGER NOT NULL,
  PRIMARY KEY(follower_id, following_id));
`);

app.use(express.json());
app.use(session({ secret: 'change-this-secret', resave: false, saveUninitialized: false }));
app.use(express.static('public'));

const needLogin = (req, res, next) =>
  req.session.userId ? next() : res.status(401).json({ error: 'Please login first' });

// ---------- Auth ----------
app.post('/api/register', (req, res) => {
  const { name, username, email, password } = req.body;
  if (!name || !username || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Fill all fields (password minimum 6 characters)' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error: 'Username: 3-20 letters, numbers or _' });
  try {
    const r = db.prepare('INSERT INTO users(name,username,email,password) VALUES(?,?,?,?)')
      .run(name.trim(), username.trim().toLowerCase(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10));
    req.session.userId = r.lastInsertRowid;
    res.json({ id: r.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Username or email already taken' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.password))
    return res.status(400).json({ error: 'Wrong email or password' });
  req.session.userId = u.id;
  res.json({ id: u.id });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json(null);
  res.json(db.prepare('SELECT id,name,username,email,bio FROM users WHERE id=?').get(req.session.userId));
});

app.put('/api/me', needLogin, (req, res) => {
  const { name, bio } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  db.prepare('UPDATE users SET name=?, bio=? WHERE id=?')
    .run(name.trim(), (bio || '').slice(0, 160), req.session.userId);
  res.json({ ok: true });
});

// ---------- Users / Profiles / Follow ----------
app.get('/api/users/:id', (req, res) => {
  const me = req.session.userId || 0;
  const u = db.prepare('SELECT id,name,username,bio FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  u.followers = db.prepare('SELECT COUNT(*) c FROM followers WHERE following_id=?').get(u.id).c;
  u.following = db.prepare('SELECT COUNT(*) c FROM followers WHERE follower_id=?').get(u.id).c;
  u.posts = db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id=?').get(u.id).c;
  u.isFollowing = !!db.prepare('SELECT 1 FROM followers WHERE follower_id=? AND following_id=?').get(me, u.id);
  res.json(u);
});

app.post('/api/users/:id/follow', needLogin, (req, res) => {
  const target = parseInt(req.params.id), me = req.session.userId;
  if (target === me) return res.status(400).json({ error: "You can't follow yourself" });
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(target))
    return res.status(404).json({ error: 'User not found' });
  const exists = db.prepare('SELECT 1 FROM followers WHERE follower_id=? AND following_id=?').get(me, target);
  if (exists) db.prepare('DELETE FROM followers WHERE follower_id=? AND following_id=?').run(me, target);
  else db.prepare('INSERT INTO followers(follower_id,following_id) VALUES(?,?)').run(me, target);
  res.json({ isFollowing: !exists });
});

// Search users / suggestions
app.get('/api/users', (req, res) => {
  const q = '%' + (req.query.q || '') + '%';
  res.json(db.prepare(`SELECT id,name,username FROM users
    WHERE (name LIKE ? OR username LIKE ?) AND id != ? LIMIT 10`).all(q, q, req.session.userId || 0));
});

// ---------- Posts ----------
// ?feed=following  -> my posts + people I follow | ?user=ID -> one user's posts | default -> all
app.get('/api/posts', (req, res) => {
  const me = req.session.userId || 0;
  let where = '1=1', params = [];
  if (req.query.user) { where = 'p.user_id = ?'; params = [req.query.user]; }
  else if (req.query.feed === 'following') {
    where = 'p.user_id = ? OR p.user_id IN (SELECT following_id FROM followers WHERE follower_id = ?)';
    params = [me, me];
  }
  const rows = db.prepare(`
    SELECT p.id, p.content, p.created_at, p.user_id, u.name, u.username,
      (SELECT COUNT(*) FROM likes WHERE post_id=p.id) AS likes,
      (SELECT COUNT(*) FROM comments WHERE post_id=p.id) AS comments,
      EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=?) AS liked
    FROM posts p JOIN users u ON u.id=p.user_id
    WHERE ${where} ORDER BY p.id DESC LIMIT 100`).all(me, ...params);
  res.json(rows);
});

app.post('/api/posts', needLogin, (req, res) => {
  const content = (req.body.content || '').trim();
  if (!content || content.length > 280)
    return res.status(400).json({ error: 'Post must be 1-280 characters' });
  const r = db.prepare('INSERT INTO posts(user_id,content) VALUES(?,?)').run(req.session.userId, content);
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/posts/:id', needLogin, (req, res) => {
  const r = db.prepare('DELETE FROM posts WHERE id=? AND user_id=?').run(req.params.id, req.session.userId);
  if (!r.changes) return res.status(403).json({ error: 'You can delete only your own posts' });
  db.prepare('DELETE FROM comments WHERE post_id=?').run(req.params.id);
  db.prepare('DELETE FROM likes WHERE post_id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Like ----------
app.post('/api/posts/:id/like', needLogin, (req, res) => {
  const pid = req.params.id, me = req.session.userId;
  if (!db.prepare('SELECT 1 FROM posts WHERE id=?').get(pid))
    return res.status(404).json({ error: 'Post not found' });
  const exists = db.prepare('SELECT 1 FROM likes WHERE user_id=? AND post_id=?').get(me, pid);
  if (exists) db.prepare('DELETE FROM likes WHERE user_id=? AND post_id=?').run(me, pid);
  else db.prepare('INSERT INTO likes(user_id,post_id) VALUES(?,?)').run(me, pid);
  const count = db.prepare('SELECT COUNT(*) c FROM likes WHERE post_id=?').get(pid).c;
  res.json({ liked: !exists, likes: count });
});

// ---------- Comments ----------
app.get('/api/posts/:id/comments', (req, res) => {
  res.json(db.prepare(`SELECT c.id,c.content,c.created_at,c.user_id,u.name,u.username
    FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.id`).all(req.params.id));
});

app.post('/api/posts/:id/comments', needLogin, (req, res) => {
  const content = (req.body.content || '').trim();
  if (!content || content.length > 200)
    return res.status(400).json({ error: 'Comment must be 1-200 characters' });
  if (!db.prepare('SELECT 1 FROM posts WHERE id=?').get(req.params.id))
    return res.status(404).json({ error: 'Post not found' });
  db.prepare('INSERT INTO comments(post_id,user_id,content) VALUES(?,?,?)')
    .run(req.params.id, req.session.userId, content);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Social app running at http://localhost:${PORT}`));
