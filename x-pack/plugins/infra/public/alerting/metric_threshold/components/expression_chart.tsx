/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Axis, Chart, niceTimeFormatter, Position, Settings } from '@elastic/charts';
import { EuiText } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { DataViewBase } from '@kbn/es-query';
import { first, last } from 'lodash';

import { MetricsSourceConfiguration } from '../../../../common/metrics_sources';
import { Color } from '../../../../common/color_palette';
import { MetricsExplorerRow, MetricsExplorerAggregation } from '../../../../common/http_api';
import { MetricExplorerSeriesChart } from '../../../pages/metrics/metrics_explorer/components/series_chart';
import { MetricExpression } from '../types';
import {
  MetricsExplorerChartType,
  MetricsExplorerOptionsMetric,
} from '../../../pages/metrics/metrics_explorer/hooks/use_metrics_explorer_options';
import { createFormatterForMetric } from '../../../pages/metrics/metrics_explorer/components/helpers/create_formatter_for_metric';
import { calculateDomain } from '../../../pages/metrics/metrics_explorer/components/helpers/calculate_domain';
import { useMetricsExplorerChartData } from '../hooks/use_metrics_explorer_chart_data';
import { getMetricId } from '../../../pages/metrics/metrics_explorer/components/helpers/get_metric_id';
import { useKibanaContextForPlugin } from '../../../hooks/use_kibana';
import {
  ChartContainer,
  LoadingState,
  NoDataState,
  TIME_LABELS,
  tooltipProps,
  getChartTheme,
} from '../../common/criterion_preview_chart/criterion_preview_chart';
import { ThresholdAnnotations } from '../../common/criterion_preview_chart/threshold_annotations';
import { CUSTOM_EQUATION } from '../i18n_strings';

interface Props {
  expression: MetricExpression;
  derivedIndexPattern: DataViewBase;
  source?: MetricsSourceConfiguration;
  filterQuery?: string;
  groupBy?: string | string[];
  chartType?: MetricsExplorerChartType;
}

export const ExpressionChart: React.FC<Props> = ({
  expression,
  derivedIndexPattern,
  source,
  filterQuery,
  groupBy,
  chartType = MetricsExplorerChartType.bar,
}) => {
  const { uiSettings } = useKibanaContextForPlugin().services;

  const { isLoading, data } = useMetricsExplorerChartData(
    expression,
    derivedIndexPattern,
    source,
    filterQuery,
    groupBy
  );

  if (isLoading) {
    return <LoadingState />;
  }

  if (!data) {
    return <NoDataState />;
  }

  const isDarkMode = uiSettings?.get('theme:darkMode') || false;
  const firstSeries = first(first(data.pages)!.series);
  // Creating a custom series where the ID is changed to 0
  // so that we can get a proper domain
  if (!firstSeries || !firstSeries.rows || firstSeries.rows.length === 0) {
    return <NoDataState />;
  }

  const firstTimestamp = first(firstSeries.rows)!.timestamp;
  const lastTimestamp = last(firstSeries.rows)!.timestamp;
  const metric: MetricsExplorerOptionsMetric = {
    field: expression.metric,
    aggregation: expression.aggType as MetricsExplorerAggregation,
    color: Color.color0,
  };

  if (metric.aggregation === 'custom') {
    metric.label = expression.label || CUSTOM_EQUATION;
  }

  const dateFormatter =
    firstTimestamp == null || lastTimestamp == null
      ? (value: number) => `${value}`
      : niceTimeFormatter([firstTimestamp, lastTimestamp]);

  const criticalThresholds = expression.threshold.slice().sort();
  const warningThresholds = expression.warningThreshold?.slice().sort() ?? [];
  const thresholds = [...criticalThresholds, ...warningThresholds].sort();

  const series = {
    ...firstSeries,
    rows: firstSeries.rows.map((row) => {
      const newRow: MetricsExplorerRow = { ...row };
      thresholds.forEach((thresholdValue, index) => {
        newRow[getMetricId(metric, `threshold_${index}`)] = thresholdValue;
      });
      return newRow;
    }),
  };

  const dataDomain = calculateDomain(series, [metric], false);
  const domain = {
    max: Math.max(dataDomain.max, last(thresholds) || dataDomain.max) * 1.1, // add 10% headroom.
    min: Math.min(dataDomain.min, first(thresholds) || dataDomain.min) * 0.9, // add 10% floor,
  };

  if (domain.min === first(expression.threshold)) {
    domain.min = domain.min * 0.9;
  }

  const { timeSize, timeUnit } = expression;
  const timeLabel = TIME_LABELS[timeUnit as keyof typeof TIME_LABELS];

  return (
    <>
      <ChartContainer>
        <Chart>
          <MetricExplorerSeriesChart
            type={chartType}
            metric={metric}
            id="0"
            series={series}
            stack={false}
          />
          <ThresholdAnnotations
            comparator={expression.comparator}
            threshold={expression.threshold}
            sortedThresholds={criticalThresholds}
            color={Color.color1}
            id="critical"
            firstTimestamp={firstTimestamp}
            lastTimestamp={lastTimestamp}
            domain={domain}
          />
          {expression.warningComparator && expression.warningThreshold && (
            <ThresholdAnnotations
              comparator={expression.warningComparator}
              threshold={expression.warningThreshold}
              sortedThresholds={warningThresholds}
              color={Color.color5}
              id="warning"
              firstTimestamp={firstTimestamp}
              lastTimestamp={lastTimestamp}
              domain={domain}
            />
          )}
          <Axis
            id={'timestamp'}
            position={Position.Bottom}
            showOverlappingTicks={true}
            tickFormat={dateFormatter}
          />
          <Axis
            id={'values'}
            position={Position.Left}
            tickFormat={createFormatterForMetric(metric)}
            domain={domain}
          />
          <Settings tooltip={tooltipProps} theme={getChartTheme(isDarkMode)} />
        </Chart>
      </ChartContainer>
      <div style={{ textAlign: 'center' }}>
        {series.id !== 'ALL' ? (
          <EuiText size="xs" color="subdued">
            <FormattedMessage
              id="xpack.infra.metrics.alerts.dataTimeRangeLabelWithGrouping"
              defaultMessage="Last {lookback} {timeLabel} of data for {id}"
              values={{ id: series.id, timeLabel, lookback: timeSize! * 20 }}
            />
          </EuiText>
        ) : (
          <EuiText size="xs" color="subdued">
            <FormattedMessage
              id="xpack.infra.metrics.alerts.dataTimeRangeLabel"
              defaultMessage="Last {lookback} {timeLabel}"
              values={{ timeLabel, lookback: timeSize! * 20 }}
            />
          </EuiText>
        )}
      </div>
    </>
  );
};
