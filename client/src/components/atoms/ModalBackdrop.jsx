import React from 'react';

import { useModalBackdropDismiss } from '../../hooks/useModalBackdropDismiss';

function ModalBackdrop({
    as = 'div',
    children,
    className,
    closeOnBackdrop = true,
    guardTextEditing = true,
    onClose,
    ...rest
}) {
    const backdropDismissHandlers = useModalBackdropDismiss(onClose, { guardTextEditing });

    return React.createElement(
        as,
        {
            className,
            ...rest,
            ...(closeOnBackdrop ? backdropDismissHandlers : {}),
        },
        children
    );
}

export default ModalBackdrop;
