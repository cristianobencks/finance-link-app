import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile, FileMismatchError } from "@/lib/telegram.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Telegram media download isolation", () => {
  it("uses distinct uncached URLs even when Telegram reuses the same file path", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("LOVABLE_API_KEY", "test-gateway");
    vi.stubEnv("TELEGRAM_API_KEY", "test-connection");
    const downloads: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: "photos/file_0.jpg" } });
      downloads.push({ url, init });
      return new Response(new Uint8Array([86, 10]));
    }));
    expect(await downloadFile("receipt-a")).toBe("Vgo=");
    await downloadFile("receipt-b");
    await downloadFile("receipt-a");
    expect(downloads).toHaveLength(3);
    const urls = downloads.map((d) => new URL(d.url));
    expect(urls[0]?.searchParams.get("resource")).not.toEqual(urls[1]?.searchParams.get("resource"));
    expect(urls[0]?.searchParams.get("resource")).toEqual(urls[2]?.searchParams.get("resource"));
    expect(new Set(downloads.map((d) => d.url)).size).toBe(3);
    for (const d of downloads) {
      expect(d.init?.cache).toBe("no-store");
      expect(new Headers(d.init?.headers).get("Cache-Control")).toBe("no-cache, no-store");
    }
  });

  it("downloads directly from Telegram when the bot token is set", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-gateway");
    vi.stubEnv("TELEGRAM_API_KEY", "test-connection");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: "photos/file_0.jpg", file_size: 2 } });
      urls.push(url);
      return new Response(new Uint8Array([86, 10]));
    }));
    expect(await downloadFile("receipt-a")).toBe("Vgo=");
    expect(urls).toEqual(["https://api.telegram.org/file/bot123:abc/photos/file_0.jpg"]);
  });

  it("rejects a downloaded file whose size differs from the one sent", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-gateway");
    vi.stubEnv("TELEGRAM_API_KEY", "test-connection");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: "photos/file_0.jpg", file_size: 121591 } });
      return new Response(new Uint8Array([1, 2, 3]));
    }));
    await expect(downloadFile("receipt-a")).rejects.toBeInstanceOf(FileMismatchError);
  });

  it("does not download when Telegram reports an invalid file", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-gateway");
    vi.stubEnv("TELEGRAM_API_KEY", "test-connection");
    const fetchMock = vi.fn(async () => Response.json({ ok: false, description: "Invalid file" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(downloadFile("invalid")).rejects.toThrow("Invalid file");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});