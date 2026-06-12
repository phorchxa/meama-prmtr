"use client";
/*
 * Documentation:
 * Pie Chart — https://app.subframe.com/396ab11e3a4e/library?component=Pie+Chart_0654ccc7-054c-4f3a-8e9a-b7c81dd3963c
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import * as SubframeUtils from "../../utils";

export interface PieChartRootProps
  extends React.ComponentProps<typeof SubframeCore.PieChart> {
  className?: string;
}

const PieChartRoot = React.forwardRef<
  React.ElementRef<typeof SubframeCore.PieChart>,
  PieChartRootProps
>(function PieChartRoot({ className, ...otherProps }: PieChartRootProps, ref) {
  return (
    <SubframeCore.PieChart
      className={SubframeUtils.twClassNames("h-52 w-52", className)}
      ref={ref}
      colors={[
        "#737373",
        "#e5e5e5",
        "#262626",
        "#d4d4d4",
        "#404040",
        "#a3a3a3",
      ]}
      {...otherProps}
    />
  );
});

export const PieChart = PieChartRoot;
