import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import ErrorModal from './ErrorModal';
import { setErrorModalRef } from '../utils/errorManager';

const ErrorModalManager = forwardRef((_, ref) => {
    // A queue rather than a single object: a second error arriving while one is
    // visible must not silently discard the first — it's appended and shown next.
    const [queue, setQueue] = useState([]);

    // Dismisses the currently-visible item and advances to the next queued one, if any.
    const hide = () => setQueue(prev => prev.slice(1));

    useImperativeHandle(ref, () => ({
        show: (title, message, buttons, type = 'error') => {
            setQueue(prev => [...prev, { title, message, buttons: buttons || [], type }]);
        },
        hide,
    }));

    const current = queue[0];

    return (
        <ErrorModal
            visible={!!current}
            title={current?.title}
            message={current?.message}
            buttons={current?.buttons}
            type={current?.type}
            onClose={hide}
        />
    );
});

// Self-registering wrapper so App.js can use it without managing a ref
const ErrorModalManagerRoot = () => {
    const ref = useRef(null);
    useEffect(() => {
        setErrorModalRef(ref.current);
        return () => setErrorModalRef(null);
    }, []);
    return <ErrorModalManager ref={ref} />;
};

export default ErrorModalManagerRoot;
