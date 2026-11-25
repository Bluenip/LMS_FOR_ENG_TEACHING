/**
 * In-app navigation history for "Back" buttons.
 *
 * Browsers do not tell a page whether the previous history entry belongs to this app, so a
 * Back button that blindly calls history.back() could leave the site (or do nothing in a fresh
 * tab). We keep a small per-tab stack of visited pages in sessionStorage:
 *  - a new path is pushed;
 *  - returning to the path just below the top (browser Back, or our Back button) pops;
 *  - reloading or changing only the query string (filters, tabs) just updates the top entry's URL.
 * When the stack holds an entry below the current page, Back can safely use history.back(),
 * which also restores the previous page's URL with its filters and selected tab.
 */

const KEY = "pivora:nav-stack";
const MAX = 50;

interface Entry {
  /** pathname, used to recognise steps */
  p: string;
  /** full in-app URL (path + query) last seen for that step */
  u: string;
}

function read(): Entry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (x): x is Entry =>
            Boolean(x) && typeof (x as Entry).p === "string" && typeof (x as Entry).u === "string"
        )
      : [];
  } catch {
    return [];
  }
}

function write(stack: Entry[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-MAX)));
  } catch {
    // private mode / storage blocked: Back buttons fall back to their parent page
  }
}

/** Records the current page (called on every route or query change). */
export function recordNavigation(pathname: string, url: string) {
  const stack = read();
  const top = stack[stack.length - 1];
  if (top && top.p === pathname) {
    top.u = url; // reload or query-only change (filters, tabs)
  } else if (stack.length >= 2 && stack[stack.length - 2]!.p === pathname) {
    stack.pop(); // went back one step
    stack[stack.length - 1]!.u = url;
  } else {
    stack.push({ p: pathname, u: url });
  }
  write(stack);
}

/** True when the page before the current one in this tab is a page of this app. */
export function canGoBackInApp(): boolean {
  return read().length >= 2;
}

/** Full URL (with filters / tab) of the in-app page before the current one, if any. */
export function previousInAppUrl(): string | null {
  const stack = read();
  return stack.length >= 2 ? stack[stack.length - 2]!.u : null;
}
