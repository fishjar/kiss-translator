export const loadingSvg = `
<svg viewBox="0 0 100 100" style="display:inline-block; width:100%; height: 100%; max-width: 24; max-height: 24;">
    <circle fill="#209CEE" stroke="none" cx="6" cy="50" r="6">
    <animateTransform
        attributeName="transform"
        dur="1s"
        type="translate"
        values="0 15 ; 0 -15; 0 15"
        repeatCount="indefinite"
        begin="0.1"
    />
    </circle>
    <circle fill="#209CEE" stroke="none" cx="30" cy="50" r="6">
    <animateTransform
        attributeName="transform"
        dur="1s"
        type="translate"
        values="0 10 ; 0 -10; 0 10"
        repeatCount="indefinite"
        begin="0.2"
    />
    </circle>
    <circle fill="#209CEE" stroke="none" cx="54" cy="50" r="6">
    <animateTransform
        attributeName="transform"
        dur="1s"
        type="translate"
        values="0 5 ; 0 -5; 0 5"
        repeatCount="indefinite"
        begin="0.3"
    />
    </circle>
</svg>
`;
