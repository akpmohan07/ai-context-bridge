// Make feature manager globally accessible
window.featureManager = new FeatureManager();

document.addEventListener('DOMContentLoaded', async () => {
    
    // Register features
    featureManager.registerFeature(
        FEATURES.FOCUS_SESSION.id,
        new FocusSession()
    );

    // Initialize with Focus Session feature
    await featureManager.initFeature(FEATURES.FOCUS_SESSION.id);
});


// Register features
featureManager.registerFeature(
    FEATURES.FOCUS_SESSION.id,
    new FocusSession()
);



