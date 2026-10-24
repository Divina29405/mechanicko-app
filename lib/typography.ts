import { Dimensions, PixelRatio, Platform } from 'react-native';

const { width } = Dimensions.get('window');
// 390 is the base width for modern standard devices (e.g., iPhone 13/14)
const scale = width / 390;

export function normalizeText(size: number) {
  const newSize = size * scale;
  // Cap the scale at 1.25x so fonts don't get comically large on tablets
  const maxScale = size * 1.25; 
  const calculatedSize = Math.min(newSize, maxScale);
  
  if (Platform.OS === 'ios') {
    return Math.round(PixelRatio.roundToNearestPixel(calculatedSize));
  }
  // Android renders text slightly larger by default, so we compensate
  return Math.round(PixelRatio.roundToNearestPixel(calculatedSize)) - 1;
}