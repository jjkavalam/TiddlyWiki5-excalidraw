import React, {
  Children,
  cloneElement,
  useEffect,
  useRef,
  useState,
} from "react";

import type * as TExcalidraw from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import "./ExampleApp.scss";

export interface AppProps {
  appTitle: string;
  useCustom: (api: ExcalidrawImperativeAPI | null, customArgs?: any[]) => void;
  customArgs?: any[];
  children: React.ReactNode;
  excalidrawLib: typeof TExcalidraw;
}

export default function ExampleApp({
  appTitle,
  useCustom,
  customArgs,
  children,
  excalidrawLib,
}: AppProps) {
  const { exportToSvg, decodeSvgMetadata } = excalidrawLib as any;
  const appRef = useRef<HTMLDivElement | null>(null);
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);

  useCustom(excalidrawAPI, customArgs);

  // Fallback decoder for embedded scene in SVG metadata (handles compressed wrapper)
  const decodeSvgMetadataFallback = async (svg: string): Promise<any | null> => {
    try {
      const start = svg.indexOf("payload-start");
      const end = svg.indexOf("payload-end");
      if (start === -1 || end === -1 || end <= start) {
        console.warn("[excalidraw-app] fallback: markers not found");
        return null;
      }
      const afterStart = svg.indexOf("-->", start);
      const beforeEnd = svg.lastIndexOf("<!--", end);
      const raw = svg.slice(afterStart > -1 ? afterStart + 3 : start + 13, beforeEnd > -1 ? beforeEnd : end);
      const b64 = raw.replace(/\s+/g, "");
      const jsonText = atob(b64);
      let wrapper: any;
      try {
        wrapper = JSON.parse(jsonText);
      } catch (e) {
        console.warn("[excalidraw-app] fallback: base64 decoded but JSON.parse failed");
        return null;
      }
      // If the wrapper indicates an extra compressed payload, inflate it
      if (wrapper && wrapper.compressed && wrapper.encoded && typeof wrapper.encoded === "string") {
        try {
          const binStr: string = wrapper.encoded;
          // Convert binary string to bytes
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i) & 0xff;
          if (typeof (window as any).DecompressionStream === "function") {
            const ds = new (window as any).DecompressionStream("deflate");
            const stream = new Blob([bytes]).stream().pipeThrough(ds);
            const decompressedBuf = await new Response(stream).arrayBuffer();
            const sceneJSON = new TextDecoder("utf-8").decode(new Uint8Array(decompressedBuf));
            const scene = JSON.parse(sceneJSON);
            return scene;
          } else {
            console.warn("[excalidraw-app] fallback: DecompressionStream not available, cannot inflate");
            return null;
          }
        } catch (e) {
          console.warn("[excalidraw-app] fallback: inflate failed", e);
          return null;
        }
      }
      // Otherwise assume wrapper is the scene itself
      return wrapper;
    } catch (err) {
      console.warn("[excalidraw-app] fallback decode failed");
      return null;
    }
  };

  // Notify parent when ready and handle incoming messages (load/export)
  useEffect(() => {
    // announce readiness so host can push initial scene
    try { window.parent?.postMessage({ type: "ready" }, "*"); } catch {}

    const onMessage = async (event: MessageEvent) => {
      const data = event?.data;
      if (!data || typeof data !== "object") return;

      // request from host to export current scene
      if (data.type === "export") {
        // by convention, default to svg
        await exportAndPost();
        return;
      }

      // load scene request
      if (data.type === "loadScene") {
        if (!excalidrawAPI) return;
        try {
          // prefer explicit scene object
          if (data.excalidrawScene) {
            excalidrawAPI.updateScene(data.excalidrawScene as any);
            return;
          }
          // Expect exactly `data.svg` from the parent bridge
          const svgText: string | undefined =
            typeof data.svg === "string" ? data.svg : undefined;

          if (svgText) {
            if (typeof decodeSvgMetadata === "function") {
              try {
                const sceneJSON = await decodeSvgMetadata({ svg: svgText });
                const scene = JSON.parse(sceneJSON);
                excalidrawAPI.updateScene(scene);
              } catch (err) {
                console.warn("[excalidraw-app] decodeSvgMetadata failed", err);
              }
            } else {
              console.warn("[excalidraw-app] decodeSvgMetadata unavailable; using fallback");
              const scene = await decodeSvgMetadataFallback(svgText);
              if (scene) {
                excalidrawAPI.updateScene(scene as any);
              } else {
                console.warn("[excalidraw-app] fallback decoder returned null");
              }
            }
          }
        } catch (err) {
          // ignore invalid payloads
          console.warn("[excalidraw-app] loadScene error");
        }
        return;
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [excalidrawAPI, decodeSvgMetadata]);

  const renderExcalidraw = (children: React.ReactNode) => {
    const Excalidraw: any = Children.toArray(children).find(
      (child) =>
        React.isValidElement(child) &&
        typeof child.type !== "string" &&
        //@ts-ignore
        child.type.displayName === "Excalidraw",
    );
    if (!Excalidraw) {
      return;
    }
    const newElement = cloneElement(Excalidraw, {
      excalidrawAPI: (api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api),
      name: "Excalidraw",
    });
    return newElement;
  };
  const handleExportToSvg = async () => {
    if (!excalidrawAPI) return;
    const svg = await exportToSvg({
      elements: excalidrawAPI.getSceneElements(),
      appState: {
        ...excalidrawAPI.getAppState(),
        exportEmbedScene: true,
      },
      files: excalidrawAPI.getFiles(),
    });
    // also post back to parent for TW bridge consumption
    const scene = {
      elements: excalidrawAPI.getSceneElements(),
      appState: excalidrawAPI.getAppState(),
      files: excalidrawAPI.getFiles(),
    } as any;
    try {
      window.parent?.postMessage(
        { type: "export", svg: svg.outerHTML, scene },
        "*",
      );
    } catch {}

    // optional: trigger a download for direct user use
    // try {
    //   const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    //   const url = URL.createObjectURL(blob);
    //   const a = document.createElement("a");
    //   a.href = url;
    //   a.download = "excalidraw.svg";
    //   document.body.appendChild(a);
    //   a.click();
    //   a.remove();
    //   URL.revokeObjectURL(url);
    // } catch {}
  };

  // shared helper for message-triggered export
  const exportAndPost = async () => {
    if (!excalidrawAPI) return;
    const svg = await exportToSvg({
      elements: excalidrawAPI.getSceneElements(),
      appState: {
        ...excalidrawAPI.getAppState(),
        exportEmbedScene: true,
      },
      files: excalidrawAPI.getFiles(),
    });
    const scene = {
      elements: excalidrawAPI.getSceneElements(),
      appState: excalidrawAPI.getAppState(),
      files: excalidrawAPI.getFiles(),
    } as any;
    try {
      window.parent?.postMessage(
        { type: "export", svg: svg.outerHTML, scene },
        "*",
      );
    } catch {}
  };

  return (
    <div className="App" ref={appRef}>
      <header className="app-header">
        <h1 className="app-title">{appTitle}</h1>
        <div className="header-actions">
          <button onClick={handleExportToSvg}>Export to SVG</button>
        </div>
      </header>
      <div className="excalidraw-wrapper">{renderExcalidraw(children)}</div>
    </div>
  );
}
