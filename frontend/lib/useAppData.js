"use client";
import { useEffect, useSyncExternalStore } from "react";
import { subscribe, getSnapshot, getServerSnapshot, refreshAppData } from "./api";

export default function useAppData() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    refreshAppData();
    const refresh = () => refreshAppData();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  return state;
}
