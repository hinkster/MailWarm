import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export function getSession() {
  return getServerSession(authOptions);
}
