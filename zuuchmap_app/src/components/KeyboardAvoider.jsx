import React from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useKeyboardOverlap } from '../hooks/useKeyboardOverlap';

/**
 * The app's KeyboardAvoidingView. iOS keeps RN's `padding` behaviour; Android
 * pads the bottom by the keyboard's measured overlap (useKeyboardOverlap),
 * which is right whether the window resized, panned or did neither —
 * `behavior="height"` assumed one of those and left footers, composer and
 * the last form fields under the keyboard in the others.
 *
 * `inModal`: inside a BaseModal, whose window starts at the screen top.
 * `iosOffset`: iOS `keyboardVerticalOffset`.
 */
const KeyboardAvoider = ({ style, children, inModal = false, iosOffset = 0 }) => {
    const keyboard = useKeyboardOverlap({ inModal });

    if (Platform.OS === 'ios') {
        return (
            <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={iosOffset} style={style}>
                {children}
            </KeyboardAvoidingView>
        );
    }
    return (
        <View ref={keyboard.ref} onLayout={keyboard.onLayout} style={[style, { paddingBottom: keyboard.overlap }]}>
            {children}
        </View>
    );
};

export default KeyboardAvoider;
