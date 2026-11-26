import { gradeDictationText } from "./dictation";
import { isSpeakingAnswer, type GradeResult, type GradingOptions, type SpeakingAnswerKey } from "./types";

export function gradeSpeaking(
  answerKey: Partial<SpeakingAnswerKey> | null | undefined,
  value: unknown,
  maxPoints: number,
  gradingOpts?: GradingOptions | null
): GradeResult {
  const transcript = typeof answerKey?.transcript === "string" ? answerKey.transcript : "";
  const studentText = isSpeakingAnswer(value)
    ? value.text
    : typeof value === "string"
      ? value
      : "";

  const res = gradeDictationText(transcript, studentText, maxPoints, gradingOpts);
  return {
    isCorrect: res.isCorrect,
    score: res.score,
    detail: res.detail,
  };
}
