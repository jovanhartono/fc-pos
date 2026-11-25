# Photos are lossy-compressed once

A Complaint is argued from faint marks in a photo: a 5mm stain, a slight discoloration. Every lossy encode blurs those a little more, and the counter's uplink is shop 4G. So the counter shrinks and encodes each photo itself, and the server keeps what arrives instead of encoding it again.

- **The counter encodes at the server's exact bound and quality**: 2560px on the long edge, WebP quality 85. Both sides read one module, `packages/server/src/schema/photo-encoding.ts`, exported through `@fresclean/api/rules`, so they cannot drift apart.
- **The server passes a photo through untouched** when it is a WebP within 2560px and at most 4,000,000 bytes. Anything else (an iPad's JPEG, a HEIC, a heavy screenshot) is encoded once, on the server, at the same settings.
- **A device that can't encode WebP uploads a high-quality JPEG**, which the server then converts: that photo takes two lossy passes, the least the device allows.

## Considered options

- **Upload originals, encode only on the server.** Rejected: a full camera photo is several times the bytes over shop 4G, and the counter waits for it.
- **Encode on both sides with their own settings.** Rejected: any difference in bound or quality makes the server re-encode every counter photo, the second lossy pass this decision exists to avoid.
