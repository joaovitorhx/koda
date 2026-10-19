import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, fonts, useTheme } from '@/shared/theme';
import { Badge, Label } from '@/shared/components/primitives';
import { thermalState, type Reading } from '@/features/operations/model';
const polar = (angle: number, radius: number) => ({
  x: 140 + radius * Math.cos((angle * Math.PI) / 180),
  y: 128 + radius * Math.sin((angle * Math.PI) / 180),
});
const arc = (start: number, end: number) => {
  const a = polar(start, 108);
  const b = polar(end, 108);
  return `M${a.x} ${a.y} A108 108 0 ${end - start > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
};
export function TemperatureGauge({
  value,
  min,
  max,
  stale,
}: {
  value?: number;
  min: number | null;
  max: number | null;
  stale: boolean;
}) {
  const { palette } = useTheme();
  if (min == null || max == null)
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Label muted>Faixa de temperatura não informada pela central.</Label>
      </View>
    );
  const state = thermalState(value, min, max);
  const bad = state === 'high' || state === 'low';
  const ratio =
    value == null ? 0.5 : Math.max(0, Math.min(1, (value - (min - 4)) / (max - min + 8)));
  const point = polar(145 + ratio * 250, 108);
  return (
    <View
      accessibilityLabel={`Temperatura ${value == null ? 'indisponível' : `${value.toFixed(1)} graus`}`}
      style={{ alignItems: 'center', paddingTop: 16 }}
    >
      <View style={{ width: 280, height: 250 }}>
        <Svg width={280} height={250}>
          <Path
            d={arc(145, 395)}
            fill="none"
            stroke={palette.border}
            strokeWidth={13}
            strokeLinecap="round"
          />
          <Path
            d={arc(145, 204)}
            fill="none"
            stroke="#C0D9E4"
            strokeWidth={13}
            strokeLinecap="round"
          />
          <Path
            d={arc(209, 331)}
            fill="none"
            stroke="#50AE90"
            strokeWidth={13}
            strokeLinecap="round"
          />
          <Path
            d={arc(336, 395)}
            fill="none"
            stroke="#E6ADA6"
            strokeWidth={13}
            strokeLinecap="round"
          />
          {value != null && (
            <>
              <Circle
                cx={point.x}
                cy={point.y}
                r={11}
                fill={palette.surface}
                stroke={bad ? colors.red : colors.blue}
                strokeWidth={3}
              />
              <Circle cx={point.x} cy={point.y} r={4} fill={bad ? colors.red : colors.blue} />
            </>
          )}
        </Svg>
        <View style={{ position: 'absolute', top: 76, left: 15, right: 15, alignItems: 'center' }}>
          <Label size={10} muted style={{ letterSpacing: 1.7 }}>
            TEMPERATURA ATUAL
          </Label>
          <Label
            size={60}
            weight="semibold"
            style={{ color: bad ? colors.red : palette.text, letterSpacing: -3, lineHeight: 85 }}
          >
            {value == null ? '—' : value.toFixed(1)}
            <Label size={21} muted>
              {' '}
              °C
            </Label>
          </Label>
          <View style={{ alignSelf: 'center' }}>
            <Badge
              tone={stale || state === 'unknown' ? 'neutral' : bad ? 'danger' : 'success'}
              label={
                stale
                  ? 'Última leitura recebida'
                  : state === 'unknown'
                    ? 'Aguardando leitura'
                    : state === 'high'
                      ? 'Acima do máximo'
                      : state === 'low'
                        ? 'Abaixo do mínimo'
                        : 'Dentro da faixa'
              }
            />
          </View>
        </View>
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 10,
            right: 10,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <Label size={10} muted>
            MÍN {min.toFixed(1)}°C
          </Label>
          <Label size={10} muted>
            MÁX {max.toFixed(1)}°C
          </Label>
        </View>
      </View>
    </View>
  );
}
export function ThermalChart({
  readings,
  min,
  max,
}: {
  readings: Reading[];
  min: number | null;
  max: number | null;
}) {
  const { palette } = useTheme();
  if (min == null || max == null)
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Label muted>Faixa de temperatura não informada pela central.</Label>
      </View>
    );
  if (!readings.length)
    return (
      <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}>
        <Label muted size={12}>
          As próximas leituras aparecerão aqui.
        </Label>
      </View>
    );
  const low = Math.min(min - 1, ...readings.map((r) => r.temperature)) - 0.4;
  const high = Math.max(max + 1, ...readings.map((r) => r.temperature)) + 0.4;
  const first = Date.parse(readings[0].timestamp);
  const last = Date.parse(readings[readings.length - 1].timestamp);
  const x = (r: Reading) =>
    28 + (last === first ? 0.5 : (Date.parse(r.timestamp) - first) / (last - first)) * 288;
  const y = (v: number) => 115 - ((v - low) / (high - low)) * 95;
  return (
    <Svg
      width="100%"
      height={154}
      viewBox="0 0 326 154"
      accessibilityLabel="Histórico de temperatura da viagem"
    >
      <Rect x={28} y={y(max)} width={288} height={y(min) - y(max)} fill={palette.success} rx={3} />
      {[min, max].map((v) => (
        <ViewlessLine key={v} value={v} y={y(v)} color={palette.muted} />
      ))}
      {readings.slice(1).map((r, i) => (
        <Line
          key={r.id}
          x1={x(readings[i])}
          y1={y(readings[i].temperature)}
          x2={x(r)}
          y2={y(r.temperature)}
          stroke={thermalState(r.temperature, min, max) === 'normal' ? colors.blue : colors.red}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      ))}
      <Circle
        cx={x(readings[readings.length - 1])}
        cy={y(readings[readings.length - 1].temperature)}
        r={4}
        fill={colors.blue}
        stroke={palette.surface}
        strokeWidth={2}
      />
      {[0, Math.floor((readings.length - 1) / 2), readings.length - 1].map((index, i) => (
        <SvgText
          key={i}
          x={28 + i * 144}
          y={144}
          fill={palette.muted}
          fontFamily={fonts.regular}
          fontSize={9}
          textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
        >
          {new Date(readings[index].timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </SvgText>
      ))}
    </Svg>
  );
}
function ViewlessLine({ value, y, color }: { value: number; y: number; color: string }) {
  return (
    <>
      <Line x1={28} x2={316} y1={y} y2={y} stroke="#90C6B2" strokeDasharray="3 4" />
      <SvgText x={0} y={y + 3} fontSize={9} fill={color}>
        {value.toFixed(0)}°
      </SvgText>
    </>
  );
}
