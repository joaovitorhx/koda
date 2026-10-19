import { View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import type { Coordinate } from '@/features/operations/model';
import { colors, useTheme } from '@/shared/theme';
import { Label } from './primitives';
export function NativeMap({
  coordinate,
  height,
}: {
  coordinate?: Coordinate;
  route: Coordinate[];
  height: number;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        height,
        backgroundColor: palette.info,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <MapPin size={28} color={colors.blue} />
      <Label muted size={12}>
        {coordinate
          ? 'Abra a localização no seu aplicativo de mapas.'
          : 'Localização do destino indisponível'}
      </Label>
    </View>
  );
}
