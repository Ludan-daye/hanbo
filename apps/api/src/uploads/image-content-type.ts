export const imageContentType = (
  image: Buffer,
): "image/jpeg" | "image/png" | null => {
  if (image.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return "image/jpeg";
  if (
    image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  return null;
};
