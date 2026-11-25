/**
 * Reanimated versions of core views, shared so each is created only once.
 */

import { Pressable, Text, View } from "react-native";
import { createAnimatedComponent, FadeInDown } from "react-native-reanimated";

/** View that accepts animated styles and entering/exiting animations. */
export const AnimatedView = createAnimatedComponent(View);

/** Pressable that accepts animated styles. */
export const AnimatedPressable = createAnimatedComponent(Pressable);

/** Text that accepts animated styles. */
export const AnimatedText = createAnimatedComponent(Text);

/** Entrance for dialog cards: a short spring rise with a fade. */
export const DIALOG_ENTERING = FadeInDown.springify().damping(18).stiffness(220);
