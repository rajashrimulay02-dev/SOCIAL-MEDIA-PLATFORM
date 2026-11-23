// ---------- Shared helpers (used on every page) ----------
let ME = null;

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// Escape user text so nobody can inject HTML/JS into the page
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function renderNav() {
  try { ME = await api('/api/me'); } catch (e) { ME = null; }
  document.getElementById('nav').innerHTML = `
    <h1 class="logo">💬 MiniSocial</h1>
    <nav>
      <a href="/">Home</a>
      ${ME
        ? `<a href="/profile.html?id=${ME.id}">My Profile</a><a href="#" onclick="logout()">Logout</a>`
        : `<a href="/login.html">Login / Register</a>`}
    </nav>`;
}

async function logout() { await api('/api/logout', 'POST'); location.href = '/'; }

// ---------- Post card (used on home + profile pages) ----------
function postHTML(p) {
  const mine = ME && ME.id === p.user_id;
  return `
  <div class="box post" id="post-${p.id}">
    <div class="meta">
      <a href="/profile.html?id=${p.user_id}">${esc(p.name)} <small>@${esc(p.username)}</small></a>
      <small>${p.created_at}</small>
    </div>
    <p>${esc(p.content)}</p>
    <div class="actions">
      <button class="${p.liked ? 'liked' : ''}" onclick="toggleLike(${p.id}, this)">${p.liked ? '❤️' : '🤍'} <span>${p.likes}</span></button>
      <button onclick="toggleComments(${p.id})">💬 ${p.comments}</button>
      ${mine ? `<button onclick="deletePost(${p.id})">🗑️ Delete</button>` : ''}
    </div>
    <div class="comments" id="comments-${p.id}" style="display:none"></div>
  </div>`;
}

async function toggleLike(id, btn) {
  try {
    const r = await api(`/api/posts/${id}/like`, 'POST');
    btn.className = r.liked ? 'liked' : '';
    btn.innerHTML = `${r.liked ? '❤️' : '🤍'} <span>${r.likes}</span>`;
  } catch (e) { alert(e.message); }
}

async function toggleComments(id) {
  const box = document.getElementById('comments-' + id);
  if (box.style.display === 'block') { box.style.display = 'none'; return; }
  box.style.display = 'block';
  loadComments(id);
}

async function loadComments(id) {
  const box = document.getElementById('comments-' + id);
  const list = await api(`/api/posts/${id}/comments`);
  box.innerHTML = list.map(c =>
    `<div class="comment"><a href="/profile.html?id=${c.user_id}">${esc(c.name)}</a>: ${esc(c.content)}</div>`).join('') +
    (ME ? `<input id="cin-${id}" placeholder="Write a comment..." onkeydown="if(event.key==='Enter')addComment(${id})">`
        : `<small><a href="/login.html">Login</a> to comment</small>`);
}

async function addComment(id) {
  const input = document.getElementById('cin-' + id);
  try { await api(`/api/posts/${id}/comments`, 'POST', { content: input.value }); loadComments(id); }
  catch (e) { alert(e.message); }
}

async function deletePost(id) {
  if (!confirm('Delete this post?')) return;
  try { await api('/api/posts/' + id, 'DELETE'); document.getElementById('post-' + id).remove(); }
  catch (e) { alert(e.message); }
}

document.addEventListener('DOMContentLoaded', renderNav);
