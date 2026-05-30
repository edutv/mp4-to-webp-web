// SPDX-License-Identifier: GPL-2.0-or-later

(function () {
  const { FFmpeg } = window.FFmpegWASM || {};

  const refs = {
    sourceFile: document.getElementById("sourceFile"),
    outputName: document.getElementById("outputName"),
    fpsRange: document.getElementById("fpsRange"),
    fpsValue: document.getElementById("fpsValue"),
    qualityRange: document.getElementById("qualityRange"),
    qualityValue: document.getElementById("qualityValue"),
    scaleToggle: document.getElementById("scaleToggle"),
    convertButton: document.getElementById("convertButton"),
    downloadLink: document.getElementById("downloadLink"),
    progressFill: document.getElementById("progressFill"),
    statusText: document.getElementById("statusText"),
    fileMeta: document.getElementById("fileMeta"),
    previewBox: document.getElementById("previewBox"),
    previewImage: document.getElementById("previewImage"),
    previewCaption: document.getElementById("previewCaption"),
  };

  const coreBase = "./vendor/ffmpeg-core";
  let ffmpeg = null;
  let selectedFile = null;
  let selectedMeta = { duration: 0, width: 0, height: 0 };
  let lastObjectUrl = null;

  refs.fpsRange.addEventListener("input", () => {
    refs.fpsValue.textContent = refs.fpsRange.value;
  });

  refs.qualityRange.addEventListener("input", () => {
    refs.qualityValue.textContent = refs.qualityRange.value;
  });

  refs.sourceFile.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    await useFile(file);
  });

  refs.convertButton.addEventListener("click", convertSelectedFile);
  refs.outputName.addEventListener("input", validateReady);

  async function useFile(file) {
    selectedFile = file;
    clearDownload();
    setProgress(0);
    setStatus("正在读取视频信息...");

    selectedMeta = await readVideoMeta(file);
    refs.outputName.value = `${stripExtension(file.name)}.webp`;
    updateMeta();
    validateReady();

    if (selectedMeta.duration > 15) {
      setStatus(`视频时长 ${selectedMeta.duration.toFixed(2)} 秒，转换可能较慢`);
    } else {
      setStatus("视频已就绪");
    }
  }

  async function convertSelectedFile() {
    if (!selectedFile) return;

    clearDownload();
    setProgress(0);
    setBusy(true, "正在准备转换...");

    const safeOutputName = normalizeOutputName(refs.outputName.value);
    const inputName = normalizeInputName(selectedFile.name);

    try {
      const engine = await loadFFmpeg();
      await cleanupFile(engine, inputName);
      await cleanupFile(engine, safeOutputName);

      setStatus("正在写入浏览器内存...");
      await engine.writeFile(inputName, new Uint8Array(await selectedFile.arrayBuffer()));

      const filters = [`fps=${refs.fpsRange.value}`];
      if (refs.scaleToggle.checked && selectedMeta.width > 1000) {
        filters.push("scale=1000:-1");
      }
      filters.push("format=rgba");

      setStatus("正在转换...");
      await engine.exec([
        "-i",
        inputName,
        "-vf",
        filters.join(","),
        "-qscale:v",
        refs.qualityRange.value,
        "-loop",
        "0",
        "-y",
        safeOutputName,
      ]);

      const result = await engine.readFile(safeOutputName);
      const blob = new Blob([result.buffer], { type: "image/webp" });
      lastObjectUrl = URL.createObjectURL(blob);

      refs.downloadLink.href = lastObjectUrl;
      refs.downloadLink.download = safeOutputName;
      refs.downloadLink.hidden = false;
      refs.previewImage.src = lastObjectUrl;
      refs.previewCaption.textContent = `${safeOutputName} · ${formatBytes(blob.size)}`;
      refs.previewBox.hidden = false;

      await cleanupFile(engine, inputName);
      await cleanupFile(engine, safeOutputName);

      setProgress(100);
      setStatus("转换完成", "success");
    } catch (error) {
      console.error(error);
      setStatus(`转换失败：${error.message || String(error)}`, "error");
    } finally {
      setBusy(false);
      validateReady();
    }
  }

  async function loadFFmpeg() {
    if (!FFmpeg) {
      throw new Error("FFmpeg WASM 文件未加载");
    }

    if (ffmpeg && ffmpeg.loaded) return ffmpeg;

    ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      if (Number.isFinite(progress)) {
        setProgress(Math.max(0, Math.min(98, progress * 100)));
      }
    });
    ffmpeg.on("log", ({ message }) => {
      if (message && /error|failed|invalid/i.test(message)) {
        console.warn(message);
      }
    });

    setStatus("正在加载转换引擎...");
    await ffmpeg.load({
      coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript", "加载核心脚本"),
      wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm", "加载转换内核"),
    });

    setStatus("转换引擎已就绪");
    return ffmpeg;
  }

  async function toBlobURL(url, mimeType, label) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${label}失败`);
    }

    const contentLength = Number(response.headers.get("content-length")) || 0;
    const reader = response.body && response.body.getReader();

    if (!reader) {
      return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: mimeType }));
    }

    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (contentLength) {
        const pct = Math.min(35, (received / contentLength) * 35);
        setProgress(pct);
        setStatus(`${label}... ${Math.round((received / contentLength) * 100)}%`);
      } else {
        setStatus(`${label}...`);
      }
    }

    return URL.createObjectURL(new Blob(chunks, { type: mimeType }));
  }

  function readVideoMeta(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const meta = {
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        };
        URL.revokeObjectURL(url);
        resolve(meta);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ duration: 0, width: 0, height: 0 });
      };
      video.src = url;
    });
  }

  function updateMeta() {
    const values = [
      selectedFile ? selectedFile.name : "未选择",
      selectedMeta.duration ? `${selectedMeta.duration.toFixed(2)} 秒` : "-",
      selectedMeta.width && selectedMeta.height ? `${selectedMeta.width} x ${selectedMeta.height}` : "-",
    ];

    refs.fileMeta.querySelectorAll("dd").forEach((node, index) => {
      node.textContent = values[index];
      node.title = values[index];
    });
  }

  function validateReady() {
    refs.convertButton.disabled = !selectedFile || !normalizeOutputName(refs.outputName.value);
  }

  function setBusy(isBusy, text) {
    refs.sourceFile.disabled = isBusy;
    refs.outputName.disabled = isBusy;
    refs.fpsRange.disabled = isBusy;
    refs.qualityRange.disabled = isBusy;
    refs.scaleToggle.disabled = isBusy;
    refs.convertButton.disabled = isBusy || !selectedFile;
    if (text) setStatus(text);
  }

  function setStatus(text, tone) {
    refs.statusText.textContent = text;
    refs.statusText.classList.toggle("is-error", tone === "error");
    refs.statusText.classList.toggle("is-success", tone === "success");
  }

  function setProgress(value) {
    refs.progressFill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  }

  function clearDownload() {
    if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = null;
    refs.downloadLink.hidden = true;
    refs.downloadLink.removeAttribute("href");
    refs.previewImage.removeAttribute("src");
    refs.previewBox.hidden = true;
  }

  async function cleanupFile(engine, path) {
    try {
      await engine.deleteFile(path);
    } catch {
      // The in-memory file may not exist yet.
    }
  }

  function stripExtension(name) {
    return name.replace(/\.[^.]+$/, "") || "output";
  }

  function normalizeOutputName(name) {
    const trimmed = (name || "").trim().replace(/[\\/:*?"<>|]+/g, "-");
    if (!trimmed) return "";
    return trimmed.toLowerCase().endsWith(".webp") ? trimmed : `${trimmed}.webp`;
  }

  function normalizeInputName(name) {
    const clean = (name || "input.mp4").replace(/[\\/:*?"<>|]+/g, "-");
    return clean || "input.mp4";
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
})();
