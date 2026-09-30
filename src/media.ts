export type Attachment = {
  id: string;
  name: string;
  mediaType: string;
  preview: string;
  path: string;
  text?: string;
  size?: number;
  frames: { mediaType: string; base64Data: string }[];
};
export async function prepareAttachment(file: File): Promise<Attachment> {
  const video = file.type.startsWith("video/");
  const image = file.type.startsWith("image/");
  const isDocument = !image && !video;
  if (
    (!isDocument &&
      !(
        video
          ? ["video/mp4", "video/webm", "video/quicktime"]
          : ["image/png", "image/jpeg", "image/webp", "image/gif"]
      ).includes(file.type)) ||
    file.size > (video ? 50 : isDocument ? 25 : 10) * 1024 * 1024
  )
    throw new Error(
      "Images: up to 10 MB. Videos: up to 50 MB. Documents and source files: up to 25 MB.",
    );
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Cannot read attachment"));
    reader.readAsDataURL(file);
  });
  let frames = image
    ? [{ mediaType: file.type, base64Data: data.split(",")[1] }]
    : [];
  if (video) {
    const clip = document.createElement("video");
    clip.muted = true;
    clip.preload = "auto";
    clip.src = URL.createObjectURL(file);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Cannot decode this video. Try MP4 or WebM.")),
          15000,
        );
        clip.onloadeddata = () => {
          clearTimeout(timer);
          resolve();
        };
        clip.onerror = () => {
          clearTimeout(timer);
          reject(new Error("This video format cannot be decoded."));
        };
      });
      if (!Number.isFinite(clip.duration) || !clip.videoWidth)
        throw new Error("This video has no readable frames.");
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        1280 / Math.max(clip.videoWidth, clip.videoHeight),
      );
      canvas.width = Math.round(clip.videoWidth * scale);
      canvas.height = Math.round(clip.videoHeight * scale);
      frames = [];
      for (let index = 0; index < 4; index++) {
        const target = Math.min(
          Math.max(0, clip.duration - 0.05),
          (clip.duration * (index + 0.5)) / 4,
        );
        if (Math.abs(clip.currentTime - target) > 0.001)
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("Video frame extraction timed out.")),
              10000,
            );
            clip.onseeked = () => {
              clearTimeout(timer);
              resolve();
            };
            clip.currentTime = target;
          });
        canvas
          .getContext("2d")!
          .drawImage(clip, 0, 0, canvas.width, canvas.height);
        frames.push({
          mediaType: "image/jpeg",
          base64Data: canvas.toDataURL("image/jpeg", 0.82).split(",")[1],
        });
      }
    } finally {
      URL.revokeObjectURL(clip.src);
      clip.removeAttribute("src");
      clip.load();
    }
  }
  const saved = await window.muse.saveAttachment({
    name: file.name,
    mediaType: file.type,
    base64Data: data.split(",")[1],
  });
  return {
    id: saved.id,
    name: file.name,
    mediaType: saved.mediaType || file.type,
    text: saved.text,
    size: saved.size || file.size,
    preview: saved.url,
    path: saved.path,
    frames,
  };
}
