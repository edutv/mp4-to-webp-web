// SPDX-License-Identifier: GPL-2.0-or-later

(function () {
  const { FFmpeg } = window.FFmpegWASM || {};

  const translations = {
    en: {
      documentTitle: "MP4 / MOV to WebP",
      languageButton: "中文",
      languageButtonLabel: "Switch to Chinese",
      title: "Video to Animated WebP",
      localBadge: "Local conversion",
      toolPanelLabel: "Conversion tool",
      step1: "Step 1: Choose source file",
      hint: "Short videos under 15 seconds are recommended. Your file is processed only in this browser.",
      chooseVideo: "Choose video",
      fileLabel: "File",
      durationLabel: "Duration",
      resolutionLabel: "Resolution",
      noneSelected: "None selected",
      step2: "Step 2: Set output",
      outputName: "Download filename",
      step3: "Step 3: Adjust settings",
      fpsLabel: "Animation frame rate",
      qualityLabel: "Encoding quality",
      scaleLabel: "Automatically scale videos wider than 1000px",
      convertButton: "Start conversion",
      downloadButton: "Download WebP",
      developerCredit: "Developer: Miao Xi",
      previewAlt: "WebP output preview",
      ready: "Ready",
      readingInfo: "Reading video information...",
      longVideo: "Video duration is {duration} seconds. Conversion may be slower.",
      videoReady: "Video is ready",
      preparing: "Preparing conversion...",
      writingMemory: "Writing file to browser memory...",
      converting: "Converting...",
      loadingEngine: "Loading conversion engine...",
      engineReady: "Conversion engine is ready",
      loadingCoreScript: "Loading core script",
      loadingCore: "Loading conversion core",
      loadFailed: "{label} failed",
      complete: "Conversion complete",
      failed: "Conversion failed: {error}",
      ffmpegMissing: "FFmpeg WASM files were not loaded",
      seconds: "seconds",
    },
    zh: {
      documentTitle: "MP4 / MOV 转 WebP",
      languageButton: "English",
      languageButtonLabel: "切换到英文",
      title: "视频转 WebP 动图",
      localBadge: "本机转换",
      toolPanelLabel: "转换工具",
      step1: "第 1 步：选择源文件",
      hint: "建议选择 15 秒以内的视频。文件只在当前浏览器中处理。",
      chooseVideo: "选择视频",
      fileLabel: "文件",
      durationLabel: "时长",
      resolutionLabel: "分辨率",
      noneSelected: "未选择",
      step2: "第 2 步：指定输出",
      outputName: "下载文件名",
      step3: "第 3 步：参数设置",
      fpsLabel: "动画帧率",
      qualityLabel: "编码质量",
      scaleLabel: "宽度超过 1000px 时自动缩放",
      convertButton: "开始转换",
      downloadButton: "下载 WebP",
      developerCredit: "开发：缪熙",
      previewAlt: "WebP 输出预览",
      ready: "准备就绪",
      readingInfo: "正在读取视频信息...",
      longVideo: "视频时长 {duration} 秒，转换可能较慢。",
      videoReady: "视频已就绪",
      preparing: "正在准备转换...",
      writingMemory: "正在写入浏览器内存...",
      converting: "正在转换...",
      loadingEngine: "正在加载转换引擎...",
      engineReady: "转换引擎已就绪",
      loadingCoreScript: "加载核心脚本",
      loadingCore: "加载转换内核",
      loadFailed: "{label}失败",
      complete: "转换完成",
      failed: "转换失败：{error}",
      ffmpegMissing: "FFmpeg WASM 文件未加载",
      seconds: "秒",
    },
  };

  const refs = {
    languageToggle: document.getElementById("languageToggle"),
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
  let currentLanguage = "en";
  let currentStatus = { key: "ready", params: {}, tone: undefined };
  let ffmpeg = null;
  let selectedFile = null;
  let selectedMeta = { duration: 0, width: 0, height: 0 };
  let lastObjectUrl = null;

  applyLanguage();

  refs.languageToggle.addEventListener("click", () => {
    currentLanguage = currentLanguage === "en" ? "zh" : "en";
    applyLanguage();
  });

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
    setStatusKey("readingInfo");

    selectedMeta = await readVideoMeta(file);
    refs.outputName.value = `${stripExtension(file.name)}.webp`;
    updateMeta();
    validateReady();

    if (selectedMeta.duration > 15) {
      setStatusKey("longVideo", { duration: selectedMeta.duration.toFixed(2) });
    } else {
      setStatusKey("videoReady");
    }
  }

  async function convertSelectedFile() {
    if (!selectedFile) return;

    clearDownload();
    setProgress(0);
    setBusy(true, "preparing");

    const safeOutputName = normalizeOutputName(refs.outputName.value);
    const inputName = normalizeInputName(selectedFile.name);

    try {
      const engine = await loadFFmpeg();
      await cleanupFile(engine, inputName);
      await cleanupFile(engine, safeOutputName);

      setStatusKey("writingMemory");
      await engine.writeFile(inputName, new Uint8Array(await selectedFile.arrayBuffer()));

      const filters = [`fps=${refs.fpsRange.value}`];
      if (refs.scaleToggle.checked && selectedMeta.width > 1000) {
        filters.push("scale=1000:-1");
      }
      filters.push("format=rgba");

      setStatusKey("converting");
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
      setStatusKey("complete", {}, "success");
    } catch (error) {
      console.error(error);
      setStatusKey("failed", { error: error.message || String(error) }, "error");
    } finally {
      setBusy(false);
      validateReady();
    }
  }

  async function loadFFmpeg() {
    if (!FFmpeg) {
      throw new Error(t("ffmpegMissing"));
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

    setStatusKey("loadingEngine");
    await ffmpeg.load({
      coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript", "loadingCoreScript"),
      wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm", "loadingCore"),
    });

    setStatusKey("engineReady");
    return ffmpeg;
  }

  async function toBlobURL(url, mimeType, labelKey) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(formatMessage("loadFailed", { label: t(labelKey) }));
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
        const percent = Math.round((received / contentLength) * 100);
        setProgress(pct);
        setStatusText(`${t(labelKey)}... ${percent}%`);
      } else {
        setStatusText(`${t(labelKey)}...`);
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

  function applyLanguage() {
    document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
    document.title = t("documentTitle");

    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-alt]").forEach((node) => {
      node.alt = t(node.dataset.i18nAlt);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
      node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
    });

    refs.languageToggle.textContent = t("languageButton");
    refs.languageToggle.setAttribute("aria-label", t("languageButtonLabel"));

    updateMeta();
    renderStatus();
  }

  function updateMeta() {
    const values = {
      file: selectedFile ? selectedFile.name : t("noneSelected"),
      duration: selectedMeta.duration ? `${selectedMeta.duration.toFixed(2)} ${t("seconds")}` : "-",
      resolution: selectedMeta.width && selectedMeta.height ? `${selectedMeta.width} x ${selectedMeta.height}` : "-",
    };

    refs.fileMeta.querySelectorAll("[data-meta]").forEach((node) => {
      const value = values[node.dataset.meta] || "-";
      node.textContent = value;
      node.title = value;
    });
  }

  function validateReady() {
    refs.convertButton.disabled = !selectedFile || !normalizeOutputName(refs.outputName.value);
  }

  function setBusy(isBusy, statusKey) {
    refs.sourceFile.disabled = isBusy;
    refs.outputName.disabled = isBusy;
    refs.fpsRange.disabled = isBusy;
    refs.qualityRange.disabled = isBusy;
    refs.scaleToggle.disabled = isBusy;
    refs.convertButton.disabled = isBusy || !selectedFile;
    if (statusKey) setStatusKey(statusKey);
  }

  function setStatusKey(key, params = {}, tone) {
    currentStatus = { key, params, tone };
    renderStatus();
  }

  function renderStatus() {
    setStatusText(formatMessage(currentStatus.key, currentStatus.params), currentStatus.tone);
  }

  function setStatusText(text, tone) {
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

  function formatMessage(key, params = {}) {
    return t(key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
  }

  function t(key) {
    return translations[currentLanguage][key] || translations.en[key] || key;
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
