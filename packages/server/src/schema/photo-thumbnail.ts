// The server files a small copy of each photo at `<key>.thumb`; the web tiles from that
// address without asking for it. Both sides read these, so they can't drift apart.
export const PHOTO_THUMBNAIL_SUFFIX = ".thumb";

// The largest tile on any Order screen. The thumbnail fits inside this square.
export const PHOTO_TILE_SIZE = 240;
