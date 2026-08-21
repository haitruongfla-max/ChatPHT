import { randomBytes, scryptSync } from "node:crypto";

const salt = randomBytes(16);
const hash = scryptSync("t2h6u1y2", salt, 64);
console.log(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}`);
