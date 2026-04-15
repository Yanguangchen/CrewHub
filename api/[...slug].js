/**
 * Single Serverless Function entry for all /api/* routes (Vercel Hobby 12-function limit).
 * URLs unchanged: /api/login → slug "login", etc.
 */
import dispatch from "./lib/httpDispatch.js";

export default dispatch;
