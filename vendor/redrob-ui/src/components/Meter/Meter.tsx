import * as React from 'react';
import { CostMeter, CostMeterProps } from '../CostMeter/CostMeter';
import { MemoryMeter, MemoryMeterProps } from '../MemoryMeter/MemoryMeter';
/**
 * What has been used against what there is. Pass `segments` for the working-memory bar (shares of one whole,
 * MemoryMeterProps); otherwise `used` against `budget` (CostMeterProps).
 */
export interface MeterProps extends CostMeterProps, MemoryMeterProps {}
/**
 * What has been used against what there is, in one component with two shapes.
 *
 * With `segments` it is the working-memory bar: shares of one whole, with the room left as a segment of its own.
 * Without, it is spend against a budget, escalating its tone at 75% and 90% on its own. The shape follows the
 * data, so a caller never chooses a meter that cannot show what it has.
 */
export function Meter(props: MeterProps): React.ReactElement {
  return props.segments ? React.createElement(MemoryMeter, props) : React.createElement(CostMeter, props);
}
export default Meter;
