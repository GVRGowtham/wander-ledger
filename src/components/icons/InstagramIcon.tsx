import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface Props {
  size?: number;
  variant?: 'white' | 'gradient';
}

/**
 * Crisp vector Instagram camera emblem for the "Create IG Post" button and share actions.
 */
export const InstagramIcon: React.FC<Props> = ({ size = 16, variant = 'white' }) => {
  const strokeColor = variant === 'white' ? '#FFFFFF' : 'url(#igGrad)';

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {variant === 'gradient' && (
        <Defs>
          <LinearGradient id="igGrad" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0%" stopColor="#F58529" />
            <Stop offset="35%" stopColor="#DD2A7B" />
            <Stop offset="70%" stopColor="#8134AF" />
            <Stop offset="100%" stopColor="#515BD4" />
          </LinearGradient>
        </Defs>
      )}
      <Rect
        x={2.5}
        y={2.5}
        width={19}
        height={19}
        rx={5.5}
        stroke={strokeColor}
        strokeWidth={2.2}
      />
      <Circle cx={12} cy={12} r={4.3} stroke={strokeColor} strokeWidth={2.2} />
      <Circle
        cx={17.6}
        cy={6.4}
        r={1.3}
        fill={variant === 'white' ? '#FFFFFF' : '#DD2A7B'}
      />
    </Svg>
  );
};
