// Prepare camera and file uploads locally before sending the reviewed photo.
export async function prepareDonationImage(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP photo.");
  if (file.size > 12_000_000) throw new Error("Choose a photo smaller than 12 MB.");
  const url = URL.createObjectURL(file);
  try {
    const picture = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("This photo could not be opened. Choose another image.")); image.src = url; });
    if (picture.naturalWidth * picture.naturalHeight > 64_000_000) throw new Error("This photo is too large. Choose a smaller version.");
    if (file.size <= 700000 && picture.naturalWidth * picture.naturalHeight <= 16_000_000) {
      return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Could not read this photo. Please try again.")); reader.readAsDataURL(file); });
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(picture.naturalWidth, picture.naturalHeight));
    canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not resize the photo. Choose an image smaller than 700 KB.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    for (const quality of [.85, .72, .58, .42]) {
      const encoded = canvas.toDataURL("image/jpeg", quality);
      if (encoded.length <= 930000) return encoded;
    }
    throw new Error("This photo is still too large. Choose a smaller image.");
  } finally { URL.revokeObjectURL(url); }
}
