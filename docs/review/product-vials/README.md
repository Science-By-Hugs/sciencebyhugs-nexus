# Personalized catalog artwork

Products without an uploaded photo now use the upright IGF-1-inspired photographed
vial and an SVG label assembled from their catalog name. Grid cards, product
details, and the added-to-cart confirmation share `src/productImage.ts`.

- Actual trailing strength/volume is extracted from the name. Missing values are
  left blank; ambiguous multi-component amounts remain in the full name.
- White powder is visible inside powder vials. Water, solutions, and concentrations
  use a matching clear-liquid template. Supplies use a neutral labeled package.
- Uploaded custom photos take priority. Known legacy generic-vial URLs and failed
  custom uploads fall back to personalized artwork.
- Text is escaped and sized to fit; labels stay upright on a clean slate backdrop.
- Two shared WebP photos total about 104 KB and are precached for the PWA. Labels
  render locally: no generation API, usage charges, database migration, or image
  URL writes are needed. Future catalog names automatically receive artwork.

`preview.webp` renders the actual label helper with representative fixture names,
not a screenshot of the live catalog. Templates were derived with the built-in
image tool from the approved upright IGF-1 image, removing printed text and making
a matching liquid version; runtime labels are deterministic SVG text.

Validation: `npm run build`, `node --test tests/*.test.cjs`, and visual inspection
of the composed preview. Browser/device acceptance should include a catalog card,
detail dialog, custom-photo failure, and added-to-cart banner on iPhone Safari.
