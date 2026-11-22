
export default function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }

      canvas.width = 500;
      canvas.height = 500;

      context.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };

    image.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    image.src = imageSrc;
  });
}
