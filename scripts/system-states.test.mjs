import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * SF-34: the production system-state boundaries of the web app. Static
 * checks of the App Router files; the components are tested in
 * src/widgets/system-states and measured by the Playwright geometry QA.
 */
const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const registry = JSON.parse(read("docs/route-registry.json"));
const shells = registry.shells.filter((shell) => shell.platform === "web");

function* files(dir) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}
const appFiles = [...files("src/app")];
/** Code without comments, so documentation never satisfies or breaks a check. */
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("not-found (ER2)", () => {
  it.each(["src/app/[locale]/not-found.tsx", "src/app/global-not-found.tsx"])(
    "%s renders the production 404 below the public header",
    (file) => {
      const source = code(file);
      expect(source).toContain("<SiteHeader />");
      expect(source).toContain("<NotFoundState />");
      expect(source).toContain("robots: { index: false }");
    },
  );

  it("routes every unknown locale path to it", () => {
    expect(code("src/app/[locale]/[...rest]/page.tsx")).toContain("notFound()");
  });
});

describe("loading boundaries (LD4)", () => {
  const sidebarShells = shells.filter((shell) => (shell.navItems ?? []).length > 0);

  it("exist in exactly the sidebar shells and render the application skeleton", () => {
    const expected = sidebarShells
      .map((shell) => join(dirname(shell.production.file), "loading.tsx"))
      .sort();
    const actual = appFiles.filter((file) => file.endsWith("/loading.tsx")).sort();
    expect(actual).toEqual(expected);
    for (const file of actual) expect(code(file)).toContain("<ApplicationSkeleton />");
  });
});

describe("session restore (LD3)", () => {
  it("every signed-in layout shows the launch screen while the session is restored", () => {
    const gated = appFiles.filter(
      (file) => file.endsWith("layout.tsx") && code(file).includes("<RequireSession"),
    );
    expect(gated.map((file) => relative("src/app/[locale]", file)).sort()).toEqual([
      "(admin)/admin/layout.tsx",
      "(sponsor)/sponsor/layout.tsx",
      "account/layout.tsx",
      "app/layout.tsx",
    ]);
    for (const file of gated) expect(code(file)).toContain("pending={<LaunchScreen />}");
  });

  it("every gated layout shows the retryable failure state while the session is unavailable (SF-24)", () => {
    const gated = appFiles.filter(
      (file) =>
        file.endsWith("layout.tsx") &&
        (code(file).includes("<RequireSession") || code(file).includes("<GuestOnly")),
    );
    expect(gated.length).toBeGreaterThan(4);
    for (const file of gated) expect(code(file)).toContain("unavailable={<SessionFailure />}");
  });
});

describe("error boundaries", () => {
  it.each(["src/app/[locale]/error.tsx", "src/app/global-error.tsx"])(
    "%s exists and never renders the error's message, stack or digest",
    (file) => {
      expect(existsSync(join(root, file))).toBe(true);
      expect(code(file)).not.toMatch(/error\.(message|stack|digest)|>\s*\{error\}/);
    },
  );
});

describe("no artificial delays", () => {
  it("system-state UI and boundaries schedule no timers of their own", () => {
    const sources = [
      ...[...files("src/widgets/system-states/ui")].filter((file) => !file.includes(".test.")),
      ...appFiles.filter((file) =>
        /\/(loading|error|not-found|global-error|global-not-found)\.tsx$/.test(file),
      ),
    ];
    for (const file of sources)
      expect([file, /setTimeout|setInterval|sleep\(/.test(code(file))]).toEqual([file, false]);
  });
});

describe("Storybook", () => {
  it("system stories render only production components", () => {
    const stories = [...files("src/app/_stories")].filter(
      (file) => file.endsWith(".stories.tsx") && code(file).includes('title: "System/'),
    );
    expect(stories.length).toBe(3);
    for (const file of stories) {
      const imports = [...code(file).matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
      for (const source of imports) {
        expect([file, source]).toEqual([
          file,
          expect.stringMatching(
            /^(@storybook\/nextjs-vite|@\/widgets\/[\w-]+|@\/shared\/ui\/[\w-]+)$/,
          ),
        ]);
      }
    }
    const titles = stories.map((file) => code(file).match(/title: "([^"]+)"/)?.[1]).sort();
    expect(titles).toEqual([
      "System/Errors/Error State",
      "System/Errors/Not Found",
      "System/Loading",
    ]);
  });

  it("authentication stories render production components with the deterministic API adapter (SF-24)", () => {
    const stories = [...files("src/app/_stories")].filter(
      (file) => file.endsWith(".stories.tsx") && code(file).includes('title: "Authentication/'),
    );
    const titles = stories.map((file) => code(file).match(/title: "([^"]+)"/)?.[1]).sort();
    expect(titles).toEqual([
      "Authentication/Application Entry",
      "Authentication/Email Code",
      "Authentication/Login",
      "Authentication/Provider States",
      "Authentication/Sign In",
      "Authentication/Sign Up",
      "Authentication/Verify Email",
      "Authentication/Welcome",
    ]);
    for (const file of stories) {
      const imports = [...code(file).matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
      for (const source of imports) {
        expect([file, source]).toEqual([
          file,
          expect.stringMatching(
            /^(@storybook\/nextjs-vite|storybook\/test|@\/widgets\/[\w-]+|@\/features\/sign-in-with-(google|apple)|@\/shared\/api\/http\/api-error|\.\/auth-story-api)$/,
          ),
        ]);
      }
    }
    // No story reaches a real backend or a live provider: fetch is replaced per story.
    expect(code("src/app/_stories/auth-story-api.ts")).toContain("window.fetch = async");
  });
});
