"use client";

import type { FieldType } from "@prisma/client";
import type {
  AnswerValue,
  CodeOptions,
  DragDropOptions,
  DrawOptions,
  FieldOptionsValue,
  HighlightOptions,
  MatchOptions,
  OrderingOptions,
  SpeakingOptions,
  VoiceAnswerOptions,
  WordsearchOptions,
} from "@/lib/grading/types";
import { MatchQuestionInput } from "./MatchQuestionInput";
import { DragDropQuestionInput } from "./DragDropQuestionInput";
import { SpeakingQuestionInput } from "./SpeakingQuestionInput";
import { VoiceAnswerInput } from "./VoiceAnswerInput";
import { HighlightQuestionInput } from "./HighlightQuestionInput";
import { OrderingQuestionInput } from "./OrderingQuestionInput";
import { WordsearchQuestionInput } from "./WordsearchQuestionInput";
import { DrawQuestionInput } from "./DrawQuestionInput";
import { CodeQuestionInput } from "./CodeQuestionInput";

const INTERACTIVE_TYPE_SET = new Set<FieldType>([
  "MATCH",
  "DRAG_DROP",
  "SPEAKING",
  "VOICE_ANSWER",
  "HIGHLIGHT",
  "ORDERING",
  "WORDSEARCH",
  "DRAW",
  "CODE",
]);

export function isInteractiveFieldType(type: FieldType): boolean {
  return INTERACTIVE_TYPE_SET.has(type);
}

interface InteractiveQuestionInputProps {
  fieldId: string;
  type: FieldType;
  submissionId?: string | null;
  options?: FieldOptionsValue | null;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
  disabled?: boolean;
}

export function InteractiveQuestionInput({
  fieldId,
  type,
  submissionId,
  options,
  value,
  onChange,
  disabled = false,
}: InteractiveQuestionInputProps) {
  const optsObj = (options && !Array.isArray(options) ? options : {}) as Record<string, unknown>;

  switch (type) {
    case "MATCH":
      return (
        <MatchQuestionInput
          fieldId={fieldId}
          options={optsObj as unknown as MatchOptions}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "DRAG_DROP":
      return (
        <DragDropQuestionInput
          fieldId={fieldId}
          options={optsObj as unknown as DragDropOptions}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "SPEAKING":
      return (
        <SpeakingQuestionInput
          fieldId={fieldId}
          options={optsObj as unknown as SpeakingOptions}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "VOICE_ANSWER":
      return (
        <VoiceAnswerInput
          fieldId={fieldId}
          submissionId={submissionId}
          options={optsObj as unknown as VoiceAnswerOptions}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "HIGHLIGHT":
      return (
        <HighlightQuestionInput
          fieldId={fieldId}
          options={optsObj as unknown as HighlightOptions}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "ORDERING":
      return (
        <OrderingQuestionInput
          fieldId={fieldId}
          options={optsObj as unknown as OrderingOptions}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "WORDSEARCH":
      return (
        <WordsearchQuestionInput
          fieldId={fieldId}
          options={optsObj as unknown as WordsearchOptions}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "DRAW":
      return (
        <DrawQuestionInput
          fieldId={fieldId}
          submissionId={submissionId}
          options={optsObj as unknown as DrawOptions}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "CODE":
      return (
        <CodeQuestionInput
          fieldId={fieldId}
          options={optsObj as unknown as CodeOptions}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    default:
      return null;
  }
}
