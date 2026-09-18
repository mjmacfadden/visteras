// Array of all default fodder images with tags for filtering
const images = [
    { id: 0, path: 'img/advertisement.jpg', tags: ['Antique', 'Advertisement', 'Brown'], attribution: 'ArtsyBee', link: 'pixabay.com/illustrations/advertisement-collage-paper-5840579/' },
    { id: 1, path: 'img/crane-2.jpg', tags: ['Vector', 'Bird', 'Brown'], attribution: 'Agzam', link: 'pixabay.com/illustrations/crane-bird-on-a-branch-nature-7459018/' },
    { id: 2, path: 'img/crane.jpg', tags: ['Vintage', 'Bird', 'Red'], attribution: 'CDD20', link: 'pixabay.com/illustrations/crane-red-crowned-crane-chinese-art-6839511/' },
    { id: 3, path: 'img/heron.png', tags: ['Vintage', 'Bird', 'Brown'], attribution: 'GDJ', link: 'pixabay.com/vectors/herons-birds-animals-poster-7881512/' },
    { id: 4, path: 'img/soda-ad.jpg', tags: ['Vintage', 'Advertisement', 'Blue'], attribution: 'VintageBlue', link: 'pixabay.com/illustrations/soda-bottle-old-ads-vintage-model-983293/' },
    { id: 5, path: 'img/vintage-cat-poster.png', tags: ['Vintage', 'Advertisement', 'Red'], attribution: 'No-longer-here', link: 'https://pixabay.com/illustrations/vintage-poster-ad-retro-design-923009/' },
    { id: 6, path: 'img/vintage-model-1.png', tags: ['Comic', 'Vector', 'Yellow'], attribution: '爪丨丂ㄒ乇尺_卩丨ㄒㄒ丨几Ꮆ乇尺', link: 'pixabay.com/illustrations/ai-generated-woman-retro-vintage-8606435/' },
    { id: 7, path: 'img/reindeer.jpg', tags: ['Christmas', 'Vintage', 'Purple'], attribution: 'freeillustrated', link: 'pixabay.com/illustrations/reindeer-antlers-christmas-2990790/' },
    { id: 8, path: 'img/carved-reindeer.jpg', tags: ['Christmas', 'Brown'], attribution: 'Alexandra_Koch', link: 'pixabay.com/illustrations/reindeer-christmas-antler-scarf-6905545/'},
    { id: 9, path: 'img/rudolph.jpg', tags: ['Christmas', 'Red'], attribution: 'Ylanite_NietjuhArt', link: 'pixabay.com/illustrations/reindeer-christmas-deer-9985063/'},
    { id: 10, path: 'img/open-sign.jpg', tags: ['Moody', 'Pink'], attribution: 'pexels', link: 'pixabay.com/photos/open-sign-neon-lights-illuminated-1836961/'},
    { id: 11, path: 'img/pink-and-yellow-photo-shoot.png', tags: ['Bright', 'Pink'], attribution: 'Alexandra_Koch', link: 'pixabay.com/illustrations/model-woman-studio-photographer-9903808/'},
    { id: 12, path: 'img/believe-in-christmas.jpg', tags: ['Christmas', 'Red'], attribution: 'JillWellington', link: 'pixabay.com/photos/christmas-saying-believe-magic-4647383/'},
    { id: 13, path: 'img/pine-branches.jpg', tags: ['Christmas', 'Outdoor', 'Green'], attribution: 'Annie Sprat', link: 'unsplash.com/photos/closeup-photo-of-green-christmas-tree-zh7GEuORbUw'},
    { id: 14, path: 'img/elf-dog.jpg', tags: ['Christmas', 'Animals', 'Brown'], attribution: 'Karsten Winegeart', link: 'unsplash.com/photos/white-and-brown-long-coated-small-dog-wearing-santa-hat-qzCgm273HW0' },
    { id: 15, path: 'img/the-dolomites.jpg', tags: ['Christmas', 'Landscape', 'Blue'], attribution: 'Tim Stief', link: 'https://unsplash.com/photos/body-of-water-and-snow-covered-mountains-during-daytime-YFFGkE3y4F8'},
];

// Tag category mapping
const tagCategories = {
    Color: ['Red', 'Pink', 'Purple', 'Brown', 'Blue', 'Yellow', 'Green'],
    Theme: ['Christmas', 'Outdoor', 'Landscape', 'Animals'],
    Mood: ['Bright', 'Moody'],
    Collection: ['Vintage', 'Antique', 'Advertisement', 'Vector', 'Bird', 'Comic']
};

// Get all unique tags
function getAllTags() {
    const tagSet = new Set();
    images.forEach(img => {
        img.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
}

// Get tags organized by category
function getTagsByCategory() {
    const allTags = getAllTags();
    const organized = {};
    
    Object.keys(tagCategories).forEach(category => {
        organized[category] = tagCategories[category].filter(tag => allTags.includes(tag));
    });
    
    const categorizedTags = new Set(Object.values(tagCategories).flat());
    const uncategorized = allTags.filter(tag => !categorizedTags.has(tag));
    if (uncategorized.length > 0) {
        organized['Other'] = uncategorized;
    }
    
    return organized;
}

// Filter images by selected tags
function filterImagesByTags(selectedTags) {
    if (!selectedTags || selectedTags.length === 0) {
        return images;
    }
    return images.filter(img => 
        img.tags.some(tag => selectedTags.includes(tag))
    );
}
