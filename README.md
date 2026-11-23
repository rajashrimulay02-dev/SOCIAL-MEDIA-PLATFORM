# Mini Social Media App (Task 2)

**Frontend:** HTML, CSS, JavaScript  
**Backend:** Node.js + Express.js  
**Database:** SQLite (users, posts, comments, likes, followers)

## Features
- User registration / login (passwords hashed with bcrypt)
- User profiles (name, bio, posts, followers / following count, edit profile)
- Create and delete posts
- Comments on posts
- Like / unlike system
- Follow / unfollow system
- "Following" feed (your posts + people you follow)

## How to run
1. Install Node.js (v18+)
2. Open terminal in this folder and run:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:3000

## Folder structure
```
server.js        -> backend (APIs + database)
public/          -> frontend pages (index, profile, login) + app.js + style.css
social.db        -> created automatically on first run
```
