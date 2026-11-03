import { CompositeBuffer, UmpWriter } from "googlevideo/ump";
import {
  FormatId,
  FormatInitializationMetadata,
  MediaHeader,
  StreamProtectionStatus,
  StreamerContext,
} from "googlevideo/protos";
import { joinBytes, protoField } from "../sabrProtocol";

export const VIDEO_ID = "kSQknoHMFtk";
export const AAC_FORMAT = { itag: 140, lastModified: "123", xtags: "lang=en" };
export const NATIVE_FORMAT = { ...AAC_FORMAT, itag: 251 };
export const nativeRequestBody = () =>
  joinBytes([
    protoField(1, 2, new Uint8Array()),
    protoField(16, 2, FormatId.encode(NATIVE_FORMAT).finish()),
    protoField(
      19,
      2,
      StreamerContext.encode({
        poToken: new Uint8Array([1, 2, 3]),
        sabrContexts: [],
        unsentSabrContexts: [],
      }).finish()
    ),
  ]);
export function mediaResponse(
  format = AAC_FORMAT,
  { index = 1, protection = 1 } = {}
) {
  const buffer = new CompositeBuffer(),
    writer = new UmpWriter(buffer);
  const parts = [
    [58, StreamProtectionStatus.encode({ status: protection }).finish()],
    [
      42,
      FormatInitializationMetadata.encode({
        videoId: VIDEO_ID,
        formatId: format,
        mimeType: format.itag === 140 ? "audio/mp4" : "audio/webm",
        endSegmentNumber: "2",
        durationUnits: "2000",
        durationTimescale: "1000",
      }).finish(),
    ],
    [
      20,
      MediaHeader.encode({
        headerId: 1,
        videoId: VIDEO_ID,
        itag: format.itag,
        lmt: format.lastModified,
        xtags: format.xtags,
        isInitSeg: index === 0,
        sequenceNumber: index,
        startMs: String(index ? (index - 1) * 1000 : 0),
        durationMs: index ? "1000" : "0",
        contentLength: "3",
      }).finish(),
    ],
    [21, new Uint8Array([1, 4, 5, 6])],
    [22, new Uint8Array([1])],
  ];
  parts.forEach(([type, data]) => writer.write(type, data));
  return joinBytes(buffer.chunks);
}
