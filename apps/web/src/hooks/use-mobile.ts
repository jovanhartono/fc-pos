import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export const useIsMobile = (breakpoint = MOBILE_BREAKPOINT) => {
  const [isMobile, setIsMobile] = React.useState(
    () => window.innerWidth < breakpoint
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };
    mql.addEventListener("change", onChange);
    // oxlint-disable-next-line react/set-state-in-effect -- re-reads the width when the breakpoint prop changes
    setIsMobile(window.innerWidth < breakpoint);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
};

export const useIsCoarsePointer = () => {
  const [isCoarse, setIsCoarse] = React.useState(
    () => window.matchMedia("(any-pointer: coarse)").matches
  );

  React.useEffect(() => {
    const mql = window.matchMedia("(any-pointer: coarse)");
    const onChange = () => {
      setIsCoarse(mql.matches);
    };
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isCoarse;
};
