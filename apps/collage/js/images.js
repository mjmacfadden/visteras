// Array of all default curated fodder images with tags for instant filtering & 0ms immediate loading
const images = [
  // --- Local Curated Vintage Base Set ---
  { id: 0, path: 'img/advertisement.jpg', largePath: 'img/advertisement.jpg', tags: ['Antique', 'Advertisement', 'Brown', 'Paper', 'Vintage', 'Ephemera'], attribution: 'ArtsyBee', link: 'pixabay.com/illustrations/advertisement-collage-paper-5840579/', source: 'pixabay' },
  { id: 1, path: 'img/crane-2.jpg', largePath: 'img/crane-2.jpg', tags: ['Vector', 'Bird', 'Brown', 'Wildlife', 'Nature', 'Vintage'], attribution: 'Agzam', link: 'pixabay.com/illustrations/crane-bird-on-a-branch-nature-7459018/', source: 'pixabay' },
  { id: 2, path: 'img/crane.jpg', largePath: 'img/crane.jpg', tags: ['Vintage', 'Bird', 'Red', 'Wildlife', 'Japanese', 'Autumn'], attribution: 'CDD20', link: 'pixabay.com/illustrations/crane-red-crowned-crane-chinese-art-6839511/', source: 'pixabay' },
  { id: 3, path: 'img/heron.png', largePath: 'img/heron.png', tags: ['Vintage', 'Bird', 'Brown', 'Wildlife', 'Botanical', 'Vector'], attribution: 'GDJ', link: 'pixabay.com/vectors/herons-birds-animals-poster-7881512/', source: 'pixabay' },
  { id: 4, path: 'img/soda-ad.jpg', largePath: 'img/soda-ad.jpg', tags: ['Vintage', 'Advertisement', 'Blue', 'Retro', 'Ephemera'], attribution: 'VintageBlue', link: 'pixabay.com/illustrations/soda-bottle-old-ads-vintage-model-983293/', source: 'pixabay' },
  { id: 5, path: 'img/vintage-cat-poster.png', largePath: 'img/vintage-cat-poster.png', tags: ['Vintage', 'Advertisement', 'Red', 'Animals', 'Poster', 'Circus'], attribution: 'No-longer-here', link: 'https://pixabay.com/illustrations/vintage-poster-ad-retro-design-923009/', source: 'pixabay' },
  { id: 6, path: 'img/vintage-model-1.png', largePath: 'img/vintage-model-1.png', tags: ['Comic', 'Vector', 'Yellow', 'Retro', 'Pop'], attribution: '爪丨丂ㄒ乇尺_卩丨ㄒㄒ丨几Ꮆ乇尺', link: 'pixabay.com/illustrations/ai-generated-woman-retro-vintage-8606435/', source: 'pixabay' },
  { id: 7, path: 'img/reindeer.jpg', largePath: 'img/reindeer.jpg', tags: ['Christmas', 'Vintage', 'Purple', 'Wildlife', 'Winter'], attribution: 'freeillustrated', link: 'pixabay.com/illustrations/reindeer-antlers-christmas-2990790/', source: 'pixabay' },
  { id: 8, path: 'img/carved-reindeer.jpg', largePath: 'img/carved-reindeer.jpg', tags: ['Christmas', 'Brown', 'Winter', 'Rustic'], attribution: 'Alexandra_Koch', link: 'pixabay.com/illustrations/reindeer-christmas-antler-scarf-6905545/', source: 'pixabay' },
  { id: 9, path: 'img/rudolph.jpg', largePath: 'img/rudolph.jpg', tags: ['Christmas', 'Red', 'Winter', 'Animals'], attribution: 'Ylanite_NietjuhArt', link: 'pixabay.com/illustrations/reindeer-christmas-deer-9985063/', source: 'pixabay' },
  { id: 10, path: 'img/open-sign.jpg', largePath: 'img/open-sign.jpg', tags: ['Moody', 'Pink', 'Retro', 'Pop', 'Neon'], attribution: 'pexels', link: 'pixabay.com/photos/open-sign-neon-lights-illuminated-1836961/', source: 'pixabay' },
  { id: 11, path: 'img/pink-and-yellow-photo-shoot.png', largePath: 'img/pink-and-yellow-photo-shoot.png', tags: ['Bright', 'Pink', 'Yellow', 'Retro', 'Fashion'], attribution: 'Alexandra_Koch', link: 'pixabay.com/illustrations/model-woman-studio-photographer-9903808/', source: 'pixabay' },
  { id: 12, path: 'img/believe-in-christmas.jpg', largePath: 'img/believe-in-christmas.jpg', tags: ['Christmas', 'Red', 'Winter', 'Typography'], attribution: 'JillWellington', link: 'pixabay.com/photos/christmas-saying-believe-magic-4647383/', source: 'pixabay' },
  { id: 13, path: 'img/pine-branches.jpg', largePath: 'img/pine-branches.jpg', tags: ['Christmas', 'Outdoor', 'Green', 'Botanical', 'Nature', 'Autumn'], attribution: 'Annie Sprat', link: 'unsplash.com/photos/closeup-photo-of-green-christmas-tree-zh7GEuORbUw', source: 'unsplash' },
  { id: 14, path: 'img/elf-dog.jpg', largePath: 'img/elf-dog.jpg', tags: ['Christmas', 'Animals', 'Brown', 'Winter'], attribution: 'Karsten Winegeart', link: 'unsplash.com/photos/white-and-brown-long-coated-small-dog-wearing-santa-hat-qzCgm273HW0', source: 'unsplash' },
  { id: 15, path: 'img/the-dolomites.jpg', largePath: 'img/the-dolomites.jpg', tags: ['Landscape', 'Outdoor', 'Blue', 'Nature', 'Moody'], attribution: 'Tim Stief', link: 'https://unsplash.com/photos/body-of-water-and-snow-covered-mountains-during-daytime-YFFGkE3y4F8', source: 'unsplash' },

  // --- Pre-Indexed Authentic Library of Congress Historical Clippings (0ms Instant Load) ---
  {
    id: 101,
    path: 'https://tile.loc.gov/image-services/iiif/service:ndnp:lu:batch_lu_gambit_ver01:data:sn88064460:00280761576:1896032801:0078/full/pct:12.5/0/default.jpg',
    largePath: 'https://tile.loc.gov/image-services/iiif/service:ndnp:lu:batch_lu_gambit_ver01:data:sn88064460:00280761576:1896032801:0078/full/pct:25/0/default.jpg',
    tags: ['Historic', 'Newspaper', 'News', 'Headlines', 'Antique', 'Advertisement', 'Brown', 'Grayscale', 'Black'],
    attribution: 'The Progress (1896) - Library of Congress',
    link: 'https://www.loc.gov/collections/chronicling-america/',
    source: 'loc'
  },
  {
    id: 102,
    path: 'https://tile.loc.gov/image-services/iiif/service:ndnp:mnhi:batch_mnhi_eiffel_ver01:data:sn83016810:00280775217:1912041601:0001/full/pct:12.5/0/default.jpg',
    largePath: 'https://tile.loc.gov/image-services/iiif/service:ndnp:mnhi:batch_mnhi_eiffel_ver01:data:sn83016810:00280775217:1912041601:0001/full/pct:25/0/default.jpg',
    tags: ['Historic', 'Newspaper', 'News', 'Headlines', 'Vintage', 'Titanic', 'Grayscale', 'Black'],
    attribution: 'The Duluth Herald (1912) - Library of Congress',
    link: 'https://www.loc.gov/collections/chronicling-america/',
    source: 'loc'
  },
  {
    id: 103,
    path: 'https://tile.loc.gov/image-services/iiif/service:ndnp:dlc:batch_dlc_japanesefern_ver01:data:sn83030214:00206539983:1919102601:0077/full/pct:12.5/0/default.jpg',
    largePath: 'https://tile.loc.gov/image-services/iiif/service:ndnp:dlc:batch_dlc_japanesefern_ver01:data:sn83030214:00206539983:1919102601:0077/full/pct:25/0/default.jpg',
    tags: ['Antique', 'Advertisement', 'Fashion', 'Ephemera', 'Vintage', 'Brown', 'Yellow', 'Paper'],
    attribution: 'New-York Tribune Illustrated (1919) - LOC',
    link: 'https://www.loc.gov/collections/chronicling-america/',
    source: 'loc'
  },
  {
    id: 104,
    path: 'https://tile.loc.gov/image-services/iiif/service:ndnp:scu:batch_scu_drayton_ver01:data:sn84026905:00212470081:1908051701:0014/full/pct:12.5/0/default.jpg',
    largePath: 'https://tile.loc.gov/image-services/iiif/service:ndnp:scu:batch_scu_drayton_ver01:data:sn84026905:00212470081:1908051701:0014/full/pct:25/0/default.jpg',
    tags: ['Historic', 'Newspaper', 'Antique', 'Advertisement', 'Ephemera', 'Brown', 'Grayscale'],
    attribution: 'The Sunday News (1908) - Library of Congress',
    link: 'https://www.loc.gov/collections/chronicling-america/',
    source: 'loc'
  },
  {
    id: 105,
    path: 'https://tile.loc.gov/image-services/iiif/service:ndnp:tu:batch_tu_baker_ver01:data:sn86069272:00212474426:1915121901:0034/full/pct:12.5/0/default.jpg',
    largePath: 'https://tile.loc.gov/image-services/iiif/service:ndnp:tu:batch_tu_baker_ver01:data:sn86069272:00212474426:1915121901:0034/full/pct:25/0/default.jpg',
    tags: ['Circus', 'Theatre', 'Advertisement', 'Broadside', 'Poster', 'Vintage', 'Historic', 'Red', 'Yellow'],
    attribution: 'The Washington Herald Holiday (1915) - LOC',
    link: 'https://www.loc.gov/collections/chronicling-america/',
    source: 'loc'
  },

  // --- Curated Botanical, Autumn & Wildlife Fodder ---
  {
    id: 201,
    path: 'https://cdn.pixabay.com/photo/2020/07/03/17/20/autumn-leaves-5367041_960_720.jpg',
    largePath: 'https://cdn.pixabay.com/photo/2020/07/03/17/20/autumn-leaves-5367041_1280.jpg',
    tags: ['Autumn', 'Vintage', 'Leaves', 'Botanical', 'Red', 'Orange', 'Yellow', 'Brown', 'Nature'],
    attribution: 'Pixabay Autumn Leaves',
    link: 'https://pixabay.com/photos/autumn-leaves-fall-foliage-5367041/',
    source: 'pixabay'
  },
  {
    id: 202,
    path: 'https://cdn.pixabay.com/photo/2019/10/22/07/52/autumn-4567950_960_720.jpg',
    largePath: 'https://cdn.pixabay.com/photo/2019/10/22/07/52/autumn-4567950_1280.jpg',
    tags: ['Autumn', 'Leaves', 'Orange', 'Yellow', 'Red', 'Foliage', 'Vintage', 'Nature'],
    attribution: 'Pixabay Golden Autumn',
    link: 'https://pixabay.com/photos/autumn-leaves-fall-golden-4567950/',
    source: 'pixabay'
  },
  {
    id: 203,
    path: 'https://cdn.pixabay.com/photo/2020/05/18/16/17/vintage-5187123_960_720.png',
    largePath: 'https://cdn.pixabay.com/photo/2020/05/18/16/17/vintage-5187123_1280.png',
    tags: ['Botanical', 'Illustration', 'Flower', 'Vintage', 'Flora', 'Green', 'Brown', 'Nature'],
    attribution: 'Pixabay Herbarium Vintage',
    link: 'https://pixabay.com/illustrations/vintage-botanical-flowers-5187123/',
    source: 'pixabay'
  },
  {
    id: 204,
    path: 'https://cdn.pixabay.com/photo/2019/10/30/16/19/flower-4589947_960_720.jpg',
    largePath: 'https://cdn.pixabay.com/photo/2019/10/30/16/19/flower-4589947_1280.jpg',
    tags: ['Botanical', 'Illustration', 'Flower', 'Flora', 'Herbarium', 'Green', 'Yellow', 'Vintage'],
    attribution: 'Pixabay Flora Specimen',
    link: 'https://pixabay.com/illustrations/flower-botanical-vintage-4589947/',
    source: 'pixabay'
  },
  {
    id: 205,
    path: 'https://cdn.pixabay.com/photo/2020/05/30/17/18/hummingbird-5239634_960_720.png',
    largePath: 'https://cdn.pixabay.com/photo/2020/05/30/17/18/hummingbird-5239634_1280.png',
    tags: ['Vintage', 'Animal', 'Illustration', 'Bird', 'Wildlife', 'Green', 'Turquoise', 'Botanical'],
    attribution: 'Pixabay Hummingbird Etching',
    link: 'https://pixabay.com/illustrations/hummingbird-vintage-bird-5239634/',
    source: 'pixabay'
  },
  {
    id: 206,
    path: 'https://cdn.pixabay.com/photo/2019/08/11/07/57/butterfly-4398337_960_720.png',
    largePath: 'https://cdn.pixabay.com/photo/2019/08/11/07/57/butterfly-4398337_1280.png',
    tags: ['Vintage', 'Animal', 'Illustration', 'Wildlife', 'Butterfly', 'Orange', 'Yellow', 'Brown'],
    attribution: 'Pixabay Victorian Butterfly',
    link: 'https://pixabay.com/illustrations/butterfly-vintage-insects-4398337/',
    source: 'pixabay'
  },
  {
    id: 207,
    path: 'https://cdn.pixabay.com/photo/2017/08/30/01/05/milky-way-2695569_960_720.jpg',
    largePath: 'https://cdn.pixabay.com/photo/2017/08/30/01/05/milky-way-2695569_1280.jpg',
    tags: ['Textures', 'Old Paper', 'Grunge', 'Paper', 'Texture', 'Wood', 'Brown', 'Grayscale'],
    attribution: 'Pixabay Grunge Textures',
    link: 'https://pixabay.com/photos/milky-way-space-stars-2695569/',
    source: 'pixabay'
  },
  {
    id: 208,
    path: 'https://cdn.pixabay.com/photo/2016/11/29/05/45/astronomy-1867616_960_720.jpg',
    largePath: 'https://cdn.pixabay.com/photo/2016/11/29/05/45/astronomy-1867616_1280.jpg',
    tags: ['Retro', 'Comic', 'Vintage', 'Pop', 'Poster', 'Yellow', 'Pink', 'Turquoise', 'Vector'],
    attribution: 'Pixabay Retro Cosmic',
    link: 'https://pixabay.com/photos/astronomy-space-night-1867616/',
    source: 'pixabay'
  }
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
