import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { ApiHealthCard } from "./api-health-card";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const healthy = () => jsonResponse({ status: "ok", service: "simplefit-api" });

describe("ApiHealthCard", () => {
  it("shows the API as online when the health check succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(healthy()));

    await renderWithProviders(<ApiHealthCard />);

    expect(screen.getByRole("heading", { name: "API connection" })).toBeInTheDocument();
    expect(screen.getByText("Checking")).toBeInTheDocument();
    expect(await screen.findByText("Online")).toBeInTheDocument();
    expect(screen.getByText("http://api.test")).toBeInTheDocument();
    expect(screen.getByText(/^Last checked at \d{1,2}:\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("shows the backend error code when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "service_unavailable",
              message: "The service is temporarily unavailable",
              details: {},
              request_id: "req-9",
            },
          },
          { status: 503 },
        ),
      ),
    );

    await renderWithProviders(<ApiHealthCard />);

    expect(await screen.findByText("Offline")).toBeInTheDocument();
    expect(screen.getByText("service_unavailable").tagName).toBe("CODE");
    expect(screen.getByText("Request ID: req-9")).toBeInTheDocument();
  });

  it("re-checks the API on demand", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(healthy());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    await renderWithProviders(<ApiHealthCard />);
    expect(await screen.findByText("Offline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check again" }));

    expect(await screen.findByText("Online")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["pl", "Połączenie z API", "Dostępne", "Sprawdź ponownie"],
    ["ru", "Подключение к API", "Доступен", "Проверить снова"],
    ["es", "Conexión con la API", "En línea", "Comprobar de nuevo"],
    ["es-MX", "Conexión con la API", "En línea", "Verificar de nuevo"],
  ] as const)("is translated in %s", async (locale, title, online, action) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(healthy()));

    await renderWithProviders(<ApiHealthCard />, { locale });

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(await screen.findByText(online)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
  });
});
