"use client";

import { usePathname } from "next/navigation";
import Nav from "./Nav";

export default function NavWrapper() {
  const pathname = usePathname();

  // Hide nav on login page
  if (pathname === "/login") return null;

  return <Nav />;
}
