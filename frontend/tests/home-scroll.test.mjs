import test from "node:test";
import assert from "node:assert/strict";
import { createHomeScrollController } from "../lib/homeScroll.js";

function browser(pathname = "/", hash = "") {
  const events = new Map();
  const frames = new Map();
  let nextFrame = 0;
  return {
    location: { pathname, hash }, scrollY: 2400, calls: [],
    scrollTo(options) { this.scrollY = options.top; this.calls.push(options); },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(name, callback) { events.set(name, callback); },
    removeEventListener(name, callback) { if (events.get(name) === callback) events.delete(name); },
    emit(name, event = {}) { events.get(name)?.(event); },
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); },
  };
}

test("returning home resets the viewport after a router scroll adjustment", () => {
  const view = browser("/dashboard/donor");
  const control = createHomeScrollController(view);
  control.routeChanged(view.location.pathname);
  assert.equal(view.calls.length, 0);
  view.location.pathname = "/";
  control.routeChanged("/");
  assert.equal(view.scrollY, 0);
  view.scrollY = 1800; // A subsequent router/browser restoration must not win.
  view.flush();
  assert.equal(view.scrollY, 0);
  assert.ok(view.calls.every((call) => call.behavior === "instant"));
  control.dispose();
});

test("Back to a home section starts at the hero even when the route commits later", () => {
  const view = browser("/donor/login");
  const control = createHomeScrollController(view);
  view.location = { pathname: "/", hash: "#giving" };
  view.emit("popstate");
  view.flush();
  view.scrollY = 1500;
  control.routeChanged("/");
  view.flush();
  assert.equal(view.scrollY, 0);
  control.dispose();
});

test("intentional section links and other pages retain their own scroll behavior", () => {
  const view = browser("/", "#giving");
  const control = createHomeScrollController(view);
  control.routeChanged("/");
  view.emit("popstate"); // Same-page section navigation is not a return from another page.
  view.flush();
  assert.equal(view.calls.length, 0);
  view.location = { pathname: "/campaigns/sample", hash: "#donate" };
  control.routeChanged(view.location.pathname);
  view.emit("pageshow", { persisted: true });
  view.flush();
  assert.equal(view.calls.length, 0);
  control.dispose();
});

test("restored browser pages reset home and pending resets are cancelled on exit", () => {
  const view = browser();
  const control = createHomeScrollController(view);
  view.emit("pageshow", { persisted: true });
  view.scrollY = 1900;
  view.flush();
  assert.equal(view.scrollY, 0);
  control.routeChanged("/");
  view.location.pathname = "/ngos";
  control.routeChanged("/ngos");
  view.scrollY = 800;
  view.flush();
  assert.equal(view.scrollY, 800);
  control.dispose();
  view.location.pathname = "/";
  view.emit("popstate");
  view.emit("pageshow", { persisted: true });
  assert.equal(view.scrollY, 800);
});
