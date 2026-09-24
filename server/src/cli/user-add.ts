import { createUser } from "../auth.js";

// npm run user:add -- email@example.com "a long password" "Display name" [owner|member]
const [email, password, name, role] = process.argv.slice(2);
if (!email || !password) {
  console.error('usage: npm run user:add -- <email> <password> ["name"] [owner|member]');
  process.exit(2);
}
if (password.length < 10) {
  console.error("password: use at least 10 characters");
  process.exit(2);
}
const u = createUser(email, password, name, role === "owner" ? "owner" : "member");
console.log(`created ${u.email} (${u.id}, ${u.role})`);
