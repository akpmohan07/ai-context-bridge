const Theme = (() => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    return {
        isDark: dark,
        claude: {
            accent: '#D97757',
            bg:     dark ? '#2d1f18' : '#fdf4f0',
            bgTo:   dark ? '#3d2518' : '#fce8dc',
        },
        chatgpt: {
            accent: '#10a37f',
            bg:     dark ? '#0f2420' : '#f0f9f7',
            bgTo:   dark ? '#0d2e28' : '#d1eee9',
        },
        copy: {
            accent: '#f59e0b',
            bg:     dark ? '#2a1f00' : '#fffbeb',
            bgTo:   dark ? '#3a2c00' : '#fef3c7',
        },
        ui: {
            dropdownBg:     dark ? '#1e1e1e' : '#ffffff',
            dropdownBorder: dark ? '#333333' : '#edeff1',
            text:           dark ? '#e5e5e5' : '#1c1c1c',
            textWeak:       dark ? '#999999' : '#888888',
            shadow:         dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.14)',
            toastBg:        dark ? '#e5e5e5' : '#1c1c1c',
            toastText:      dark ? '#1c1c1c' : '#ffffff',
            triggerBg:      '#10a37f',
            triggerHoverBg: '#0d9f6b',
        },
        popup: {
            bg:           dark ? '#1a1a1a' : '#ffffff',
            headerBg:     dark ? '#0d2e28' : '#10a37f',
            border:       dark ? '#2a2a2a' : '#f3f3f3',
            sectionLabel: dark ? '#888888' : '#aaaaaa',
            sliderOff:    dark ? '#444444' : '#dddddd',
            sliderOn:     '#10a37f',
        },
    };
})();
