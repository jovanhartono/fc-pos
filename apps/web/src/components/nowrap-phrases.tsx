import { Fragment } from "react";

interface NowrapPhrasesProps {
  phrases: string[];
}

// "min Rp 150.000" never splits across lines, and a wrapped line never starts
// with "·": only whole phrases wrap.
export const NowrapPhrases = ({ phrases }: NowrapPhrasesProps) =>
  phrases.map((phrase, index) => (
    <Fragment key={phrase}>
      {index > 0 ? " " : null}
      <span className="whitespace-nowrap">
        {phrase}
        {index < phrases.length - 1 ? " ·" : null}
      </span>
    </Fragment>
  ));
