"use client";
import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createHomeScrollController } from "../lib/homeScroll";

export default function HomeScrollReset() {
  const pathname = usePathname();
  const controller = useRef(null);
  useLayoutEffect(() => {
    controller.current = createHomeScrollController(window);
    return () => { controller.current.dispose(); controller.current = null; };
  }, []);
  useLayoutEffect(() => {
    controller.current?.routeChanged(pathname);
  }, [pathname]);
  return null;
}
