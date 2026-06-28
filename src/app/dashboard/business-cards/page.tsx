"use client";

import {
  Building2,
  Camera,
  Check,
  CreditCard,
  ImageUp,
  LoaderCircle,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  PageToolbar,
  SectionCard,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMasking } from "@/components/masking-provider";
import { formatKoreanPhoneNumber } from "@/lib/phone";
import type { BusinessCard, BusinessCardInputMethod } from "@/lib/types";

const REVIEW_NAME_PREFIX = "이름 확인 필요 (";

/* ───────────────────── 타입 & 상수 ───────────────────── */

interface BusinessCardFormState {
  name: string;
  company_name: string;
  position: string;
  email: string;
  phone: string;
  address: string;
  input_method: BusinessCardInputMethod;
  image_name: string;
  image_mime_type: string;
  image_base64: string;
  ocr_raw_text: string;
}

const INITIAL_FORM: BusinessCardFormState = {
  name: "",
  company_name: "",
  position: "",
  email: "",
  phone: "",
  address: "",
  input_method: "photo",
  image_name: "",
  image_mime_type: "",
  image_base64: "",
  ocr_raw_text: "",
};

const BATCH_CONCURRENCY = 3;
const OCR_IMAGE_MAX_DIMENSION = 1400;
const OCR_IMAGE_QUALITY = 0.72;
const OCR_IMAGE_MIME_TYPE = "image/jpeg";
const CARD_DETECTION_WIDTH = 180;
const AUTO_CAPTURE_STABLE_FRAMES = 7;
const AUTO_CAPTURE_INTERVAL_MS = 140;
const AUTO_CAPTURE_UNLOCK_FRAMES = 4;

function buildPayload(form: BusinessCardFormState) {
  return {
    name: form.name,
    company_name: form.company_name,
    position: form.position,
    email: form.email,
    phone: formatKoreanPhoneNumber(form.phone),
    address: form.address,
    input_method: form.input_method,
    image_name: form.image_name,
    image_mime_type: form.image_mime_type,
    image_base64: form.image_base64,
    ocr_raw_text: form.ocr_raw_text,
  };
}

function replaceFileExtension(filename: string, extension: string) {
  const baseName = filename.replace(/\.[^/.]+$/, "");
  return `${baseName || "business-card"}.${extension}`;
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { image, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function compressImageForOcr(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }

  let objectUrl: string | null = null;
  try {
    const { image, url } = await loadImage(file);
    objectUrl = url;
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    if (!sourceWidth || !sourceHeight) {
      return file;
    }

    const scale = Math.min(1, OCR_IMAGE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      return file;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, OCR_IMAGE_MIME_TYPE, OCR_IMAGE_QUALITY);
    });

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File([blob], replaceFileExtension(file.name, "jpg"), {
      type: OCR_IMAGE_MIME_TYPE,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    })
  );

  return results;
}

function isReviewNeededName(name: string | null | undefined) {
  return typeof name === "string" && name.startsWith(REVIEW_NAME_PREFIX);
}

function findPeak(scores: Float32Array, startRatio: number, endRatio: number) {
  const start = Math.max(1, Math.floor(scores.length * startRatio));
  const end = Math.min(scores.length - 2, Math.ceil(scores.length * endRatio));
  let index = start;
  let score = 0;

  for (let i = start; i <= end; i++) {
    const smoothed = scores[i - 1] * 0.25 + scores[i] * 0.5 + scores[i + 1] * 0.25;
    if (smoothed > score) {
      score = smoothed;
      index = i;
    }
  }

  return { index, score };
}

function detectBusinessCardOutline(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): { orientation: CardOrientation } | null {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  if (!sourceWidth || !sourceHeight) {
    return null;
  }

  const sampleWidth = CARD_DETECTION_WIDTH;
  const sampleHeight = Math.max(80, Math.round((sampleWidth * sourceHeight) / sourceWidth));
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, sampleWidth, sampleHeight);
  const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
  const gray = new Uint8ClampedArray(sampleWidth * sampleHeight);

  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel++) {
    gray[pixel] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }

  const verticalScores = new Float32Array(sampleWidth);
  const horizontalScores = new Float32Array(sampleHeight);
  let edgeCount = 0;

  for (let y = 2; y < sampleHeight - 2; y++) {
    for (let x = 2; x < sampleWidth - 2; x++) {
      const index = y * sampleWidth + x;
      const gx = Math.abs(gray[index + 1] - gray[index - 1]);
      const gy = Math.abs(gray[index + sampleWidth] - gray[index - sampleWidth]);
      const gradient = gx + gy;

      if (gradient > 38) {
        verticalScores[x] += gx;
        horizontalScores[y] += gy;
        edgeCount++;
      }
    }
  }

  const left = findPeak(verticalScores, 0.08, 0.43);
  const right = findPeak(verticalScores, 0.57, 0.92);
  const top = findPeak(horizontalScores, 0.12, 0.48);
  const bottom = findPeak(horizontalScores, 0.52, 0.9);
  const width = right.index - left.index;
  const height = bottom.index - top.index;
  const aspectRatio = width / Math.max(height, 1);
  const verticalStrength = Math.min(left.score, right.score) / sampleHeight;
  const horizontalStrength = Math.min(top.score, bottom.score) / sampleWidth;
  const edgeDensity = edgeCount / (sampleWidth * sampleHeight);
  const isLandscapeCard = aspectRatio > 1.15 && aspectRatio < 2.45;
  const isPortraitCard = aspectRatio > 0.38 && aspectRatio < 0.95;
  const hasReliableEdges =
    verticalStrength > 9 &&
    horizontalStrength > 7 &&
    edgeDensity > 0.012;
  const hasUsableSize =
    width > sampleWidth * 0.28 &&
    height > sampleHeight * 0.22;

  if (!hasReliableEdges || !hasUsableSize || (!isLandscapeCard && !isPortraitCard)) {
    return null;
  }

  return { orientation: isPortraitCard ? "portrait" : "landscape" };
}

/** 사진 한 장을 OCR → 자동 저장하고 결과를 반환한다. */
async function ocrAndSave(file: File): Promise<{ name: string; needsReview: boolean }> {
  const uploadFile = await compressImageForOcr(file);
  const body = new FormData();
  body.append("file", uploadFile);

  const ocrRes = await fetch("/api/business-cards/ocr", { method: "POST", body });
  const ocrResult = await ocrRes.json().catch(() => null);
  if (!ocrRes.ok) throw new Error(ocrResult?.error ?? "OCR 실패");

  const form: BusinessCardFormState = {
    ...INITIAL_FORM,
    name: ocrResult?.name ?? "",
    company_name: ocrResult?.company_name ?? "",
    position: ocrResult?.position ?? "",
    email: ocrResult?.email ?? "",
    phone: ocrResult?.phone ?? "",
    address: ocrResult?.address ?? "",
    input_method: "photo",
    image_name: ocrResult?.image_name ?? uploadFile.name,
    image_mime_type: ocrResult?.image_mime_type ?? uploadFile.type,
    image_base64: ocrResult?.image_base64 ?? "",
    ocr_raw_text: ocrResult?.raw_text ?? "",
  };

  const saveRes = await fetch("/api/business-cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(form)),
  });
  const saveResult = await saveRes.json().catch(() => null);
  if (!saveRes.ok) {
    throw new Error(saveResult?.error ?? "저장 실패");
  }

  const name = saveResult?.name ?? form.name;
  return {
    name,
    needsReview: isReviewNeededName(name),
  };
}

/* ─── 일괄등록 대기열 항목 ─── */

interface BatchItem {
  id: string;
  file: File;
  thumbnail: string;
  status: "pending" | "processing" | "done" | "error";
  resultName?: string;
  errorMessage?: string;
}

type CameraMode = "batch" | "dialog";
type CardOrientation = "landscape" | "portrait";

/* ───────────────────── 메인 페이지 ───────────────────── */

export default function BusinessCardsPage() {
  const { mask } = useMasking();
  const batchFileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const autoCaptureStableFramesRef = useRef(0);
  const autoCaptureMissedFramesRef = useRef(0);
  const autoCaptureLockedRef = useRef(false);
  const autoCaptureInFlightRef = useRef(false);

  const [cards, setCards] = useState<BusinessCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  /* 수기입력 / 수정 다이얼로그 */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<BusinessCard | null>(null);
  const [form, setForm] = useState<BusinessCardFormState>(INITIAL_FORM);

  /* 명함 미리보기 */
  const [previewCard, setPreviewCard] = useState<BusinessCard | null>(null);

  /* 일괄 등록 */
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);

  /* 카메라 촬영 */
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("batch");
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraCapturing, setCameraCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cardOutlineDetected, setCardOutlineDetected] = useState(false);
  const [cardGuideOrientation, setCardGuideOrientation] = useState<CardOrientation>("landscape");
  const [autoCaptureProgress, setAutoCaptureProgress] = useState(0);
  const [autoCaptureMessage, setAutoCaptureMessage] = useState("명함을 화면 중앙에 맞춰주세요.");

  /* ─── 카드 조회 ─── */
  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/business-cards", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "명함 목록을 불러오지 못했습니다.");
      setCards(Array.isArray(result) ? (result as BusinessCard[]) : []);
    } catch (fetchError) {
      console.error("명함 목록 조회 실패:", fetchError instanceof Error ? fetchError.message : String(fetchError));
      toast.error("명함 목록 조회에 실패했습니다.");
      setCards([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCards();
  }, [fetchCards]);

  const filteredCards = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return cards;
    return cards.filter((card) =>
      [card.name, card.company_name, card.position, card.email, card.phone, card.address]
        .filter(Boolean)
        .join("\n")
        .toLowerCase()
        .includes(keyword)
    );
  }, [cards, search]);

  const photoCount = useMemo(() => cards.filter((c) => c.input_method === "photo").length, [cards]);
  const companyCount = useMemo(() => new Set(cards.map((c) => c.company_name).filter(Boolean)).size, [cards]);

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!cameraOpen) {
      stopCamera();
      autoCaptureStableFramesRef.current = 0;
      autoCaptureMissedFramesRef.current = 0;
      autoCaptureLockedRef.current = false;
      autoCaptureInFlightRef.current = false;
      setCardOutlineDetected(false);
      setCardGuideOrientation("landscape");
      setAutoCaptureProgress(0);
      setAutoCaptureMessage("명함을 화면 중앙에 맞춰주세요.");
      return;
    }

    let cancelled = false;

    async function startCamera() {
      setCameraStarting(true);
      setCameraError(null);
      stopCamera();

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("이 브라우저에서는 카메라 촬영을 지원하지 않습니다.");
        setCameraStarting(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => null);
        }
      } catch (cameraStartError) {
        console.error(
          "카메라 시작 실패:",
          cameraStartError instanceof Error ? cameraStartError.message : String(cameraStartError)
        );
        setCameraError("카메라를 열 수 없습니다. 브라우저 권한과 연결된 카메라를 확인해 주세요.");
      } finally {
        if (!cancelled) {
          setCameraStarting(false);
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraOpen, stopCamera]);

  const openCamera = (mode: CameraMode) => {
    setCameraMode(mode);
    setCameraError(null);
    setCardOutlineDetected(false);
    setCardGuideOrientation("landscape");
    setAutoCaptureProgress(0);
    setAutoCaptureMessage("명함을 화면 중앙에 맞춰주세요.");
    autoCaptureStableFramesRef.current = 0;
    autoCaptureMissedFramesRef.current = 0;
    autoCaptureLockedRef.current = false;
    autoCaptureInFlightRef.current = false;
    setCameraOpen(true);
  };

  const createCameraFile = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      throw new Error("카메라 화면을 아직 불러오지 못했습니다.");
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("촬영 이미지를 만들지 못했습니다.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, OCR_IMAGE_MIME_TYPE, 0.9);
    });

    if (!blob) {
      throw new Error("촬영 이미지를 만들지 못했습니다.");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new File([blob], `business-card-${timestamp}.jpg`, {
      type: OCR_IMAGE_MIME_TYPE,
      lastModified: Date.now(),
    });
  }, []);

  /* ─── 일괄 등록 ─── */
  const addBatchFiles = (files: FileList | null) => {
    if (!files) return;
    const newItems: BatchItem[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      thumbnail: URL.createObjectURL(file),
      status: "pending" as const,
    }));
    setBatchItems((prev) => [...prev, ...newItems]);
  };

  const addBatchFile = useCallback((file: File) => {
    setBatchItems((prev) => [
      ...prev,
      {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        thumbnail: URL.createObjectURL(file),
        status: "pending" as const,
      },
    ]);
  }, []);

  const removeBatchItem = (id: string) => {
    setBatchItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.thumbnail);
      return prev.filter((i) => i.id !== id);
    });
  };

  const processBatch = async () => {
    if (batchProcessing) return;
    const pending = batchItems.filter((i) => i.status === "pending" || i.status === "error");
    if (pending.length === 0) return;

    setBatchProcessing(true);

    const results = await runWithConcurrency(pending, BATCH_CONCURRENCY, async (item) => {
      setBatchItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "processing" as const } : i))
      );
      try {
        const { name, needsReview } = await ocrAndSave(item.file);
        setBatchItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "done" as const,
                  resultName: needsReview ? `${name} · 검토 필요` : name,
                }
              : i
          )
        );
        return true;
      } catch (err) {
        setBatchItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "error" as const,
                  errorMessage: err instanceof Error ? err.message : "등록 실패",
                }
              : i
          )
        );
        return false;
      }
    });

    const successCount = results.filter(Boolean).length;
    setBatchProcessing(false);
    if (successCount > 0) {
      toast.success(`${successCount}장의 명함이 등록되었습니다.`);
      await fetchCards();
    }
  };

  const closeBatch = () => {
    batchItems.forEach((i) => URL.revokeObjectURL(i.thumbnail));
    setBatchItems([]);
    setBatchOpen(false);
  };

  /* ─── 수기입력 / 수정 다이얼로그 ─── */
  const openCreateDialog = () => {
    setEditingCard(null);
    setForm({ ...INITIAL_FORM, input_method: "manual" });
    setDialogOpen(true);
  };

  const openEditDialog = (card: BusinessCard) => {
    setEditingCard(card);
    setForm({
      name: card.name ?? "",
      company_name: card.company_name ?? "",
      position: card.position ?? "",
      email: card.email ?? "",
      phone: formatKoreanPhoneNumber(card.phone ?? ""),
      address: card.address ?? "",
      input_method: card.input_method,
      image_name: card.image_name ?? "",
      image_mime_type: card.image_mime_type ?? "",
      image_base64: card.image_base64 ?? "",
      ocr_raw_text: card.ocr_raw_text ?? "",
    });
    setDialogOpen(true);
  };

  const handleFieldChange = (key: keyof BusinessCardFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /* 수정 다이얼로그에서 사진 재촬영 */
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDialogImageUpload = useCallback(async (file: File) => {
    setOcrLoading(true);
    try {
      const uploadFile = await compressImageForOcr(file);
      const body = new FormData();
      body.append("file", uploadFile);
      const response = await fetch("/api/business-cards/ocr", { method: "POST", body });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "OCR 실패");

      setForm((prev) => ({
        ...prev,
        name: result?.name ?? prev.name,
        company_name: result?.company_name ?? prev.company_name,
        position: result?.position ?? prev.position,
        email: result?.email ?? prev.email,
        phone: formatKoreanPhoneNumber(result?.phone ?? prev.phone),
        address: result?.address ?? prev.address,
        input_method: "photo",
        image_name: result?.image_name ?? uploadFile.name,
        image_mime_type: result?.image_mime_type ?? uploadFile.type,
        image_base64: result?.image_base64 ?? "",
        ocr_raw_text: result?.raw_text ?? "",
      }));
      toast.success("명함 사진에서 정보를 추출했습니다.");
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : "OCR 실패");
    } finally {
      setOcrLoading(false);
    }
  }, []);

  const handleDialogFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await handleDialogImageUpload(file);
  };

  const handleCameraShot = useCallback(async () => {
    if (cameraCapturing || cameraStarting || cameraError) return;

    setCameraCapturing(true);
    try {
      const file = await createCameraFile();

      if (cameraMode === "dialog") {
        await handleDialogImageUpload(file);
        setCameraOpen(false);
        return;
      }

      addBatchFile(file);
      toast.success("촬영한 명함 사진을 대기열에 추가했습니다.");
    } catch (shotError) {
      toast.error(shotError instanceof Error ? shotError.message : "사진 촬영에 실패했습니다.");
    } finally {
      setCameraCapturing(false);
    }
  }, [
    addBatchFile,
    cameraCapturing,
    cameraError,
    cameraMode,
    cameraStarting,
    createCameraFile,
    handleDialogImageUpload,
  ]);

  useEffect(() => {
    if (!cameraOpen || cameraStarting || cameraCapturing || cameraError) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const video = videoRef.current;
      const detectionCanvas = detectionCanvasRef.current;

      if (!video || !detectionCanvas || !video.videoWidth || !video.videoHeight) {
        return;
      }

      const outline = detectBusinessCardOutline(video, detectionCanvas);
      const detected = Boolean(outline);
      setCardOutlineDetected(detected);
      if (outline) {
        setCardGuideOrientation(outline.orientation);
      }

      if (autoCaptureInFlightRef.current) {
        return;
      }

      if (autoCaptureLockedRef.current) {
        if (detected) {
          autoCaptureMissedFramesRef.current = 0;
          autoCaptureStableFramesRef.current = 0;
          setAutoCaptureProgress(1);
          setAutoCaptureMessage("촬영 완료. 다음 명함을 화면에 보여주세요.");
          return;
        }

        autoCaptureMissedFramesRef.current += 1;
        if (autoCaptureMissedFramesRef.current >= AUTO_CAPTURE_UNLOCK_FRAMES) {
          autoCaptureLockedRef.current = false;
          autoCaptureStableFramesRef.current = 0;
          autoCaptureMissedFramesRef.current = 0;
          setAutoCaptureProgress(0);
          setAutoCaptureMessage("다음 명함의 윤곽을 맞춰주세요.");
        }
        return;
      }

      if (!detected) {
        autoCaptureStableFramesRef.current = 0;
        autoCaptureMissedFramesRef.current = 0;
        setAutoCaptureProgress(0);
        setAutoCaptureMessage("명함을 화면 중앙 가이드에 맞춰주세요.");
        return;
      }

      autoCaptureStableFramesRef.current += 1;
      const progress = Math.min(autoCaptureStableFramesRef.current / AUTO_CAPTURE_STABLE_FRAMES, 1);
      setAutoCaptureProgress(progress);
      setAutoCaptureMessage(
        progress >= 1 ? "자동 촬영 중..." : "윤곽 감지됨. 잠시 고정해 주세요."
      );

      if (autoCaptureStableFramesRef.current >= AUTO_CAPTURE_STABLE_FRAMES) {
        autoCaptureInFlightRef.current = true;
        autoCaptureLockedRef.current = true;
        setAutoCaptureProgress(1);
        setAutoCaptureMessage("자동 촬영 중...");
        void handleCameraShot().finally(() => {
          autoCaptureInFlightRef.current = false;
        });
      }
    }, AUTO_CAPTURE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [cameraCapturing, cameraError, cameraOpen, cameraStarting, handleCameraShot]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("이름을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        editingCard ? `/api/business-cards/${editingCard.id}` : "/api/business-cards",
        {
          method: editingCard ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(form)),
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "저장 실패");

      toast.success(editingCard ? "명함을 수정했습니다." : "명함을 등록했습니다.");
      setDialogOpen(false);
      setEditingCard(null);
      setForm(INITIAL_FORM);
      await fetchCards();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (card: BusinessCard) => {
    if (!confirm(`"${card.name}" 명함을 삭제하시겠습니까?`)) return;
    try {
      const response = await fetch(`/api/business-cards/${card.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "삭제 실패");
      toast.success("명함을 삭제했습니다.");
      await fetchCards();
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "삭제 실패");
    }
  };

  const handlePreviewOpen = (card: BusinessCard) => {
    if (!card.drive_file_id) {
      toast.error("미리볼 명함 이미지가 없습니다.");
      return;
    }
    setPreviewCard(card);
  };

  const batchPendingCount = batchItems.filter(
    (i) => i.status === "pending" || i.status === "error"
  ).length;
  const batchProcessingCount = batchItems.filter((i) => i.status === "processing").length;
  const batchDoneCount = batchItems.filter((i) => i.status === "done").length;

  return (
    <PageShell>
      <PageHeader
        title="명함관리"
        description="명함을 직접 입력하거나 사진 촬영 후 Gemini OCR로 인식해 연락처 정보를 관리합니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setBatchOpen(true)}
            >
              <Camera className="h-4 w-4" />
              <span>촬영</span>
            </Button>
            <Button
              variant="outline"
              className="border-dashed text-muted-foreground hover:text-foreground"
              onClick={openCreateDialog}
            >
              <Plus className="h-4 w-4" />
              <span>수기입력</span>
            </Button>
          </div>
        }
      />

      <StatsGrid columns={3}>
        <StatCard
          label="등록 명함"
          value={`${cards.length}건`}
          description="현재 저장된 전체 명함 수"
          icon={CreditCard}
        />
        <StatCard
          label="사진 OCR 등록"
          value={`${photoCount}건`}
          description="사진촬영 또는 이미지 업로드로 등록된 명함"
          icon={Camera}
          tone="info"
        />
        <StatCard
          label="회사 수"
          value={`${companyCount}곳`}
          description="중복 제외 회사 기준"
          icon={Building2}
          tone="success"
        />
      </StatsGrid>

      <PageToolbar>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름, 회사명, 직책, 이메일, 전화번호 검색"
              className="pl-10"
            />
          </div>
          {search ? (
            <Button variant="ghost" onClick={() => setSearch("")}>
              검색 초기화
            </Button>
          ) : null}
        </div>
      </PageToolbar>

      {loading ? (
        <LoadingState label="명함 목록을 불러오는 중..." />
      ) : error ? (
        <ErrorState onRetry={() => void fetchCards()} />
      ) : filteredCards.length === 0 ? (
        <EmptyState
          title={search ? "검색 결과가 없습니다." : "등록된 명함이 없습니다."}
          description={
            search
              ? "다른 검색어로 다시 확인해 주세요."
              : "촬영으로 명함을 추가하거나 수기입력으로 직접 등록해 주세요."
          }
          action={
            !search ? (
              <div className="flex gap-2">
                <Button onClick={() => setBatchOpen(true)}>
                  <Camera className="h-4 w-4" />
                  촬영
                </Button>
                <Button
                  variant="outline"
                  className="border-dashed text-muted-foreground hover:text-foreground"
                  onClick={openCreateDialog}
                >
                  <Plus className="h-4 w-4" />
                  수기입력
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCards.map((card) => (
            <SectionCard key={card.id} className="gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-left text-lg font-semibold text-foreground">
                      {mask("name", card.name)}
                    </span>
                    {isReviewNeededName(card.name) ? (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        검토 필요
                      </span>
                    ) : null}
                    {card.drive_file_id ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full px-2.5 text-[11px]"
                        onClick={() => handlePreviewOpen(card)}
                      >
                        명함보기
                      </Button>
                    ) : (
                      <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {card.input_method === "photo" ? "사진 OCR" : "수기입력"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{card.company_name ? mask("customer_name", card.company_name) : "회사명 없음"}</p>
                  <p className="text-sm text-muted-foreground">{card.position || "직책 없음"}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="명함 메뉴">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditDialog(card)}>수정</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => void handleDelete(card)}>
                      삭제
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="size-4" />
                  <span className="truncate">{card.email ? mask("email", card.email) : "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="size-4" />
                  <span>{card.phone ? mask("phone", formatKoreanPhoneNumber(card.phone)) : "-"}</span>
                </div>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0" />
                  <span className="line-clamp-2">{card.address ? mask("address", card.address) : "-"}</span>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {/* ═══ 수기입력 / 수정 다이얼로그 ═══ */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingCard(null);
            setForm(INITIAL_FORM);
            setOcrLoading(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCard ? "명함 수정" : "명함추가 (수기입력)"}</DialogTitle>
            <DialogDescription>
              {editingCard
                ? "명함 정보를 수정합니다. 사진을 재촬영하면 OCR로 필드가 갱신됩니다."
                : "명함 정보를 직접 입력합니다."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* 수정 시 사진 재촬영 지원 */}
            {editingCard ? (
              <div className="space-y-3 rounded-[1.25rem] border border-border/70 bg-background/50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">사진 재촬영</p>
                    <p className="text-sm text-muted-foreground">
                      새 사진을 촬영하면 OCR로 필드가 갱신됩니다.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openCamera("dialog")}
                      disabled={ocrLoading}
                    >
                      {ocrLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Camera className="size-4" />}
                      사진촬영
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={ocrLoading}
                    >
                      {ocrLoading ? <LoaderCircle className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
                      파일 업로드
                    </Button>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleDialogFileChange(e)} />
                {form.image_name ? (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-card/70 p-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <span>파일: {form.image_name}</span>
                    </div>
                    {form.ocr_raw_text ? (
                      <div className="mt-3 rounded-xl bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
                        {form.ocr_raw_text}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="business-card-name">이름</Label>
                <Input
                  id="business-card-name"
                  value={form.name}
                  onChange={(event) => handleFieldChange("name", event.target.value)}
                  placeholder="홍길동"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-card-company">회사명</Label>
                <Input
                  id="business-card-company"
                  value={form.company_name}
                  onChange={(event) => handleFieldChange("company_name", event.target.value)}
                  placeholder="회사명"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-card-position">직책</Label>
                <Input
                  id="business-card-position"
                  value={form.position}
                  onChange={(event) => handleFieldChange("position", event.target.value)}
                  placeholder="직책"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-card-email">이메일</Label>
                <Input
                  id="business-card-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => handleFieldChange("email", event.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="business-card-phone">전화번호</Label>
                <Input
                  id="business-card-phone"
                  value={form.phone}
                  onChange={(event) =>
                    handleFieldChange("phone", formatKoreanPhoneNumber(event.target.value))
                  }
                  placeholder="010-0000-0000"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="business-card-address">주소</Label>
                <Input
                  id="business-card-address"
                  value={form.address}
                  onChange={(event) => handleFieldChange("address", event.target.value)}
                  placeholder="서울특별시 ..."
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || ocrLoading}>
              {saving ? "저장 중..." : editingCard ? "명함 수정" : "명함 등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ 일괄등록 다이얼로그 ═══ */}
      <Dialog open={batchOpen} onOpenChange={(open) => { if (!open && !batchProcessing) closeBatch(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>명함 일괄등록</DialogTitle>
            <DialogDescription>
              명함 사진을 여러 장 선택하면 압축 후 최대 {BATCH_CONCURRENCY}장씩 동시에 OCR + 등록합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => openCamera("batch")}
                disabled={batchProcessing}
              >
                <Camera className="size-4" />
                사진촬영
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => batchFileRef.current?.click()}
                disabled={batchProcessing}
              >
                <ImageUp className="size-4" />
                파일 선택
              </Button>
              <input
                ref={batchFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { addBatchFiles(e.target.files); e.target.value = ""; }}
              />
            </div>

            {batchItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-card/70 px-4 py-10 text-center text-sm text-muted-foreground">
                사진촬영 또는 파일 선택으로 명함 사진을 추가하세요.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {batchItems.map((item) => (
                  <div
                    key={item.id}
                    className="group relative overflow-hidden rounded-xl border border-border/70"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Blob URLs are local upload previews. */}
                    <img
                      src={item.thumbnail}
                      alt={item.file.name}
                      className="aspect-[3/2] w-full object-cover"
                    />
                    {/* 상태 오버레이 */}
                    {item.status === "processing" ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <LoaderCircle className="size-6 animate-spin text-white" />
                      </div>
                    ) : item.status === "done" ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50">
                        <Check className="size-6 text-green-400" />
                        <span className="px-2 text-center text-xs text-white">{item.resultName}</span>
                      </div>
                    ) : item.status === "error" ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50">
                        <X className="size-6 text-red-400" />
                        <span className="px-2 text-center text-xs text-white">{item.errorMessage}</span>
                      </div>
                    ) : null}
                    {/* 삭제 버튼 (대기 중 + 에러일 때만) */}
                    {(item.status === "pending" || item.status === "error") && !batchProcessing ? (
                      <button
                        type="button"
                        onClick={() => removeBatchItem(item.id)}
                        className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {batchItems.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                총 {batchItems.length}장
                {batchDoneCount > 0 ? ` · 완료 ${batchDoneCount}장` : ""}
                {batchProcessingCount > 0 ? ` · 처리중 ${batchProcessingCount}장` : ""}
                {batchPendingCount > 0 ? ` · 대기 ${batchPendingCount}장` : ""}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeBatch} disabled={batchProcessing}>
              {batchDoneCount > 0 && batchPendingCount === 0 ? "닫기" : "취소"}
            </Button>
            {batchPendingCount > 0 ? (
              <Button onClick={() => void processBatch()} disabled={batchProcessing}>
                {batchProcessing ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  `${batchPendingCount}장 일괄등록`
                )}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ 카메라 촬영 다이얼로그 ═══ */}
      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {cameraMode === "batch"
                ? "명함 사진 촬영"
                : "명함 사진 재촬영"}
            </DialogTitle>
            <DialogDescription>
              카메라에 명함이 선명하게 보이면 자동으로 촬영됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-black">
              {cameraError ? (
                <div className="flex h-[58vh] min-h-[320px] max-h-[560px] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white sm:aspect-video sm:h-auto sm:min-h-0">
                  <Camera className="size-8 opacity-80" />
                  <p>{cameraError}</p>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    className="h-[58vh] min-h-[320px] max-h-[560px] w-full bg-black object-contain sm:aspect-video sm:h-auto sm:min-h-0"
                    autoPlay
                    muted
                    playsInline
                  />
                  {cameraStarting ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white">
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                      카메라 연결 중...
                    </div>
                  ) : null}
                  <div
                    className={`pointer-events-none absolute left-1/2 top-1/2 max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 transition-all ${
                      cardOutlineDetected
                        ? "border-emerald-400 shadow-[0_0_0_999px_rgba(0,0,0,0.15)]"
                        : "border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.2)]"
                    }`}
                    style={
                      cardGuideOrientation === "portrait"
                        ? { height: "72%", aspectRatio: "5 / 9" }
                        : { width: "68%", aspectRatio: "9 / 5" }
                    }
                  />
                </>
              )}
              <canvas ref={canvasRef} className="hidden" />
              <canvas ref={detectionCanvasRef} className="hidden" />
            </div>

            {!cameraError ? (
              <div className="rounded-xl border border-border/70 bg-card/70 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={`size-2 rounded-full ${
                      cardOutlineDetected ? "bg-emerald-500" : "bg-muted-foreground/50"
                    }`}
                  />
                  <span className="text-muted-foreground">
                    {cameraCapturing ? "촬영 이미지를 처리하는 중입니다." : autoCaptureMessage}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.round(autoCaptureProgress * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}

            {cameraMode === "batch" ? (
              <p className="text-sm text-muted-foreground">
                가로/세로 명함 모두 윤곽이 잡히면 대기열에 자동 추가됩니다.
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCameraOpen(false);
                if (cameraMode === "batch") {
                  batchFileRef.current?.click();
                } else {
                  fileInputRef.current?.click();
                }
              }}
              disabled={cameraCapturing || cameraStarting}
            >
              <ImageUp className="size-4" />
              파일 선택
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCameraOpen(false)}
                disabled={cameraCapturing}
              >
                닫기
              </Button>
              <Button
                type="button"
                onClick={() => void handleCameraShot()}
                disabled={cameraCapturing || cameraStarting || Boolean(cameraError)}
              >
                {cameraCapturing ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  <>
                    <Camera className="size-4" />
                    {cameraMode === "batch" ? "촬영해서 추가" : "촬영하기"}
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ 명함 미리보기 ═══ */}
      <Dialog open={Boolean(previewCard)} onOpenChange={(open) => (!open ? setPreviewCard(null) : null)}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewCard?.name ? mask("name", previewCard.name) : "명함 미리보기"}</DialogTitle>
            <DialogDescription>
              {previewCard?.company_name ? mask("customer_name", previewCard.company_name) : "저장된 명함 이미지를 확인합니다."}
            </DialogDescription>
          </DialogHeader>
          {previewCard?.drive_file_id ? (
            <div className="h-[70vh] overflow-hidden rounded-xl border border-border/70 bg-black/5">
              <iframe
                title={`${previewCard.name} 명함 미리보기`}
                src={`https://drive.google.com/file/d/${previewCard.drive_file_id}/preview`}
                className="h-full w-full border-0"
                allow="autoplay"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
              미리볼 명함 이미지가 없습니다.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
