// Array of all default curated fodder images with rich tags for 0ms instant loading
const images = [
  { id: 0, path: 'img/advertisement.jpg', largePath: 'img/advertisement.jpg', tags: ['Antique', 'Advertisement', 'Brown', 'Paper', 'Vintage', 'Ephemera', 'News', 'Newspaper', 'Headlines', 'Historic', 'Textures'], attribution: 'ArtsyBee', link: 'pixabay.com/illustrations/advertisement-collage-paper-5840579/', source: 'pixabay' },
  { id: 1, path: 'img/crane-2.jpg', largePath: 'img/crane-2.jpg', tags: ['Vector', 'Bird', 'Brown', 'Wildlife', 'Nature', 'Vintage', 'Botanical', 'Illustration', 'Animals'], attribution: 'Agzam', link: 'pixabay.com/illustrations/crane-bird-on-a-branch-nature-7459018/', source: 'pixabay' },
  { id: 2, path: 'img/crane.jpg', largePath: 'img/crane.jpg', tags: ['Vintage', 'Bird', 'Red', 'Orange', 'Yellow', 'Wildlife', 'Autumn', 'Leaves', 'Nature', 'Illustration', 'Japanese'], attribution: 'CDD20', link: 'pixabay.com/illustrations/crane-red-crowned-crane-chinese-art-6839511/', source: 'pixabay' },
  { id: 3, path: 'img/heron.png', largePath: 'img/heron.png', tags: ['Vintage', 'Bird', 'Brown', 'Green', 'Wildlife', 'Botanical', 'Vector', 'Nature', 'Animals'], attribution: 'GDJ', link: 'pixabay.com/vectors/herons-birds-animals-poster-7881512/', source: 'pixabay' },
  { id: 4, path: 'img/soda-ad.jpg', largePath: 'img/soda-ad.jpg', tags: ['Vintage', 'Advertisement', 'Blue', 'Retro', 'Ephemera', 'Pop', 'Poster', 'Antique'], attribution: 'VintageBlue', link: 'pixabay.com/illustrations/soda-bottle-old-ads-vintage-model-983293/', source: 'pixabay' },
  { id: 5, path: 'img/vintage-cat-poster.png', largePath: 'img/vintage-cat-poster.png', tags: ['Vintage', 'Advertisement', 'Red', 'Yellow', 'Animals', 'Poster', 'Circus', 'Theatre', 'Playbills', 'Broadside', 'Retro'], attribution: 'No-longer-here', link: 'https://pixabay.com/illustrations/vintage-poster-ad-retro-design-923009/', source: 'pixabay' },
  { id: 6, path: 'img/vintage-model-1.png', largePath: 'img/vintage-model-1.png', tags: ['Comic', 'Vector', 'Yellow', 'Pink', 'Turquoise', 'Retro', 'Pop', 'Fashion', 'Illustration'], attribution: '爪丨丂ㄒ乇尺_卩丨ㄒㄒ丨几Ꮆ乇尺', link: 'pixabay.com/illustrations/ai-generated-woman-retro-vintage-8606435/', source: 'pixabay' },
  { id: 7, path: 'img/reindeer.jpg', largePath: 'img/reindeer.jpg', tags: ['Christmas', 'Vintage', 'Purple', 'Lilac', 'Wildlife', 'Winter', 'Animals'], attribution: 'freeillustrated', link: 'pixabay.com/illustrations/reindeer-antlers-christmas-2990790/', source: 'pixabay' },
  { id: 8, path: 'img/carved-reindeer.jpg', largePath: 'img/carved-reindeer.jpg', tags: ['Christmas', 'Brown', 'Winter', 'Rustic', 'Textures', 'Wood', 'Animals'], attribution: 'Alexandra_Koch', link: 'pixabay.com/illustrations/reindeer-christmas-antler-scarf-6905545/', source: 'pixabay' },
  { id: 9, path: 'img/rudolph.jpg', largePath: 'img/rudolph.jpg', tags: ['Christmas', 'Red', 'Brown', 'Winter', 'Animals', 'Wildlife'], attribution: 'Ylanite_NietjuhArt', link: 'pixabay.com/illustrations/reindeer-christmas-deer-9985063/', source: 'pixabay' },
  { id: 10, path: 'img/open-sign.jpg', largePath: 'img/open-sign.jpg', tags: ['Moody', 'Pink', 'Retro', 'Pop', 'Neon', 'Textures', 'Dark', 'Black'], attribution: 'pexels', link: 'pixabay.com/photos/open-sign-neon-lights-illuminated-1836961/', source: 'pixabay' },
  { id: 11, path: 'img/pink-and-yellow-photo-shoot.png', largePath: 'img/pink-and-yellow-photo-shoot.png', tags: ['Bright', 'Pink', 'Yellow', 'Retro', 'Fashion', 'Pop'], attribution: 'Alexandra_Koch', link: 'pixabay.com/illustrations/model-woman-studio-photographer-9903808/', source: 'pixabay' },
  { id: 12, path: 'img/believe-in-christmas.jpg', largePath: 'img/believe-in-christmas.jpg', tags: ['Christmas', 'Red', 'Winter', 'Typography', 'Quote', 'Vintage'], attribution: 'JillWellington', link: 'pixabay.com/photos/christmas-saying-believe-magic-4647383/', source: 'pixabay' },
  { id: 13, path: 'img/pine-branches.jpg', largePath: 'img/pine-branches.jpg', tags: ['Christmas', 'Outdoor', 'Green', 'Botanical', 'Nature', 'Autumn', 'Flora', 'Specimen', 'Herbarium', 'Leaves'], attribution: 'Annie Sprat', link: 'unsplash.com/photos/closeup-photo-of-green-christmas-tree-zh7GEuORbUw', source: 'unsplash' },
  { id: 14, path: 'img/elf-dog.jpg', largePath: 'img/elf-dog.jpg', tags: ['Christmas', 'Animals', 'Brown', 'Winter', 'Wildlife'], attribution: 'Karsten Winegeart', link: 'unsplash.com/photos/white-and-brown-long-coated-small-dog-wearing-santa-hat-qzCgm273HW0', source: 'unsplash' },
  { id: 15, path: 'img/the-dolomites.jpg', largePath: 'img/the-dolomites.jpg', tags: ['Landscape', 'Outdoor', 'Blue', 'Grayscale', 'Nature', 'Moody', 'Textures', 'Mountains'], attribution: 'Tim Stief', link: 'https://unsplash.com/photos/body-of-water-and-snow-covered-mountains-during-daytime-YFFGkE3y4F8', source: 'unsplash' }
];

// Tag category mapping
const tagCategories = {
    Color: ['Red', 'Orange', 'Yellow', 'Green', 'Turquoise', 'Blue', 'Lilac', 'Pink', 'Brown', 'Grayscale', 'Black', 'White'],
    Theme: ['Autumn', 'Botanical', 'Christmas', 'Historic', 'Wildlife', 'Outdoor', 'Landscape', 'Animals'],
    Mood: ['Vintage', 'Antique', 'Bright', 'Moody', 'Rustic'],
    Collection: ['Newspaper', 'News', 'Headlines', 'Advertisement', 'Ephemera', 'Vector', 'Bird', 'Comic', 'Textures', 'Paper', 'Poster', 'Circus', 'Theatre']
};

// Get all unique tags
function getAllTags() {
    const tagSet = new Set();
    images.forEach(img => {
        if (Array.isArray(img.tags)) {
            img.tags.forEach(tag => tagSet.add(tag));
        }
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

// Filter images by selected tags or query words
function filterImagesByTags(selectedTags) {
    if (!selectedTags || selectedTags.length === 0) {
        return images;
    }
    const lowerTags = selectedTags.map(t => t.toLowerCase());
    const matches = images.filter(img => 
        Array.isArray(img.tags) && img.tags.some(tag => lowerTags.includes(tag.toLowerCase()))
    );
    return matches.length > 0 ? matches : images;
}
