import json
import os

months_data = {}

def add(date_key, name, year, note):
    m = date_key.split("-")[0]
    if m not in months_data:
        months_data[m] = {}
    if date_key not in months_data[m]:
        months_data[m][date_key] = []
    months_data[m][date_key].append({"name": name, "year": year, "note": note})

# ==================== JANUARY ====================
add("01-01", "Paul Revere", 1735, "American patriot & silversmith")
add("01-01", "J.D. Salinger", 1919, "Author ('The Catcher in the Rye')")
add("01-01", "Christine Lagarde", 1956, "European Central Bank President")
add("01-01", "Lilian Thuram", 1972, "World Cup champion footballer")

add("01-02", "Isaac Asimov", 1920, "Science fiction author & biochemist")
add("01-02", "Roger Miller", 1936, "Country singer-songwriter ('King of the Road')")
add("01-02", "Cuba Gooding Jr.", 1968, "Academy Award-winning actor")
add("01-02", "Christy Turlington", 1969, "Supermodel & maternal health advocate")

add("01-03", "J.R.R. Tolkien", 1892, "Author ('The Lord of the Rings')")
add("01-03", "Sergio Leone", 1929, "Pioneering film director ('Spaghetti Westerns')")
add("01-03", "Eli Manning", 1981, "2-time Super Bowl MVP quarterback")
add("01-03", "Florence Pugh", 1996, "Oscar-nominated actor ('Little Women')")

add("01-04", "Louis Braille", 1809, "Inventor of the Braille reading system")
add("01-04", "Don Shula", 1930, "Hall of Fame NFL head coach (347 wins)")
add("01-04", "Floyd Patterson", 1935, "Heavyweight boxing champion")
add("01-04", "Michael Stipe", 1960, "R.E.M. lead singer & songwriter")

add("01-05", "King C. Gillette", 1855, "Inventor of the safety razor")
add("01-05", "Robert Duvall", 1931, "Academy Award-winning actor ('The Godfather')")
add("01-05", "Diane Keaton", 1946, "Academy Award-winning actor ('Annie Hall')")
add("01-05", "Bradley Cooper", 1975, "Oscar-nominated actor & director ('A Star Is Born')")

add("01-06", "Joan of Arc", 1412, "French heroine & patron saint")
add("01-06", "Syd Barrett", 1946, "Pink Floyd co-founder & songwriter")
add("01-06", "Rowan Atkinson", 1955, "Actor & comedian ('Mr. Bean')")
add("01-06", "Howie Long", 1960, "NFL Hall of Fame defensive lineman & analyst")

add("01-07", "Zora Neale Hurston", 1891, "Author ('Their Eyes Were Watching God')")
add("01-07", "Kenny Loggins", 1948, "Singer-songwriter ('Footloose', 'Danger Zone')")
add("01-07", "Nicolas Cage", 1964, "Academy Award-winning actor ('Leaving Las Vegas')")
add("01-07", "Lewis Hamilton", 1985, "7-time Formula One World Champion")

add("01-08", "Elvis Presley", 1935, "The King of Rock and Roll")
add("01-08", "Shirley Bassey", 1937, "Welsh singer ('Goldfinger', 'Diamonds Are Forever')")
add("01-08", "Stephen Hawking", 1942, "Theoretical physicist & cosmologist")
add("01-08", "David Bowie", 1947, "Legendary music & cultural icon")

add("01-09", "Richard Nixon", 1913, "37th U.S. President")
add("01-09", "Bart Starr", 1934, "Hall of Fame Packers QB & Super Bowl I MVP")
add("01-09", "Jimmy Page", 1944, "Led Zeppelin founder & guitarist")
add("01-09", "Dave Matthews", 1967, "Singer-songwriter & bandleader")

add("01-10", "Rod Stewart", 1945, "Rock & pop singer-songwriter ('Maggie May')")
add("01-10", "Donald Fagen", 1948, "Steely Dan co-founder & keyboardist")
add("01-10", "George Foreman", 1949, "2-time World Heavyweight champion & entrepreneur")
add("01-10", "Pat Benatar", 1953, "4-time Grammy-winning rock singer")

add("01-11", "Alexander Hamilton", 1757, "Founding Father & first U.S. Treasury Secretary")
add("01-11", "Naomi Judd", 1946, "Country music Hall of Famer (The Judds)")
add("01-11", "Darryl Dawkins", 1957, "NBA player ('Chocolate Thunder')")
add("01-11", "Mary J. Blige", 1971, "Queen of Hip-Hop Soul & Oscar nominee")

add("01-12", "Jack London", 1876, "Author ('The Call of the Wild')")
add("01-12", "Joe Frazier", 1944, "Undisputed World Heavyweight boxing champion ('Smokin\' Joe')")
add("01-12", "Howard Stern", 1954, "Radio personality & broadcaster")
add("01-12", "Jeff Bezos", 1964, "Amazon founder & aerospace pioneer")

add("01-13", "Julia Louis-Dreyfus", 1961, "11-time Emmy-winning actor ('Seinfeld', 'Veep')")
add("01-13", "Patrick Dempsey", 1966, "Actor ('Grey\'s Anatomy') & racing driver")
add("01-13", "Orlando Bloom", 1977, "Actor ('The Lord of the Rings', 'Pirates of the Caribbean')")
add("01-13", "Liam Hemsworth", 1990, "Actor ('The Hunger Games')")

add("01-14", "Albert Schweitzer", 1875, "Theologian, physician & Nobel Peace laureate")
add("01-14", "Faye Dunaway", 1941, "Academy Award-winning actor ('Network', 'Chinatown')")
add("01-14", "LL Cool J", 1968, "Hip-hop pioneer & actor ('NCIS: Los Angeles')")
add("01-14", "Dave Grohl", 1969, "Foo Fighters frontman & Nirvana drummer")

add("01-15", "Martin Luther King Jr.", 1929, "Civil rights leader & Nobel Peace laureate")
add("01-15", "Regina King", 1971, "Academy Award & 4-time Emmy-winning actor")
add("01-15", "Drew Brees", 1979, "Super Bowl XLIV MVP quarterback")
add("01-15", "Pitbull", 1981, "Grammy-winning rapper & entertainer ('Mr. Worldwide')")

add("01-16", "John Carpenter", 1948, "Horror & sci-fi film director & composer ('Halloween')")
add("01-16", "Sade", 1959, "Grammy-winning British singer-songwriter ('Smooth Operator')")
add("01-16", "Lin-Manuel Miranda", 1980, "Pulitzer & Tony-winning creator of 'Hamilton'")
add("01-16", "Albert Pujols", 1980, "3-time NL MVP & 700-home-run club member")

add("01-17", "Benjamin Franklin", 1706, "Founding Father, scientist & inventor")
add("01-17", "Betty White", 1922, "Beloved television icon ('The Golden Girls')")
add("01-17", "Muhammad Ali", 1942, "3-time World Heavyweight champion ('The Greatest')")
add("01-17", "Jim Carrey", 1962, "Golden Globe-winning actor & comedian")
add("01-17", "Michelle Obama", 1964, "Former First Lady & best-selling author")

add("01-18", "Cary Grant", 1904, "Classic Hollywood leading man ('North by Northwest')")
add("01-18", "Kevin Costner", 1955, "Academy Award-winning actor & director ('Dances with Wolves')")
add("01-18", "Mark Rylance", 1960, "Academy Award & 3-time Tony Award-winning actor")
add("01-18", "Pep Guardiola", 1971, "Legendary football manager & player")

add("01-19", "Edgar Allan Poe", 1809, "Pioneering poet & master of gothic mystery ('The Raven')")
add("01-19", "Janis Joplin", 1943, "Legendary blues-rock vocalist ('Piece of My Heart')")
add("01-19", "Dolly Parton", 1946, "Beloved country music superstar & philanthropist")
add("01-19", "Shawn Johnson", 1992, "Olympic gold medalist gymnast")

add("01-20", "Federico Fellini", 1920, "Renowned Italian director ('8 1/2', 'La Dolce Vita')")
add("01-20", "Buzz Aldrin", 1930, "Apollo 11 astronaut & second human on the Moon")
add("01-20", "David Lynch", 1946, "Surrealist film director ('Twin Peaks', 'Mulholland Drive')")
add("01-20", "Questlove", 1971, "Oscar-winning filmmaker & The Roots drummer")

add("01-21", "Plácido Domingo", 1941, "World-renowned operatic tenor & conductor")
add("01-21", "Paul Allen", 1953, "Microsoft co-founder & philanthropist")
add("01-21", "Geena Davis", 1956, "Academy Award-winning actor ('Thelma & Louise')")
add("01-21", "Hakeem Olajuwon", 1963, "NBA Hall of Fame center & 2-time champion ('The Dream')")

add("01-22", "George Balanchine", 1904, "Choreographer & father of American ballet")
add("01-22", "Sam Cooke", 1931, "King of Soul & civil rights activist ('A Change Is Gonna Come')")
add("01-22", "Steve Perry", 1949, "Journey lead vocalist & songwriter ('Don\'t Stop Believin\'')")
add("01-22", "Diane Lane", 1965, "Oscar-nominated actor ('Unfaithful')")

add("01-23", "John Hancock", 1737, "Statesman & prominent Declaration of Independence signer")
add("01-23", "Django Reinhardt", 1910, "Pioneering jazz guitarist & composer")
add("01-23", "Mariska Hargitay", 1964, "Emmy-winning actor ('Law & Order: SVU')")
add("01-23", "Arjen Robben", 1984, "Dutch international football star")

add("01-24", "Neil Diamond", 1941, "Hall of Fame singer-songwriter ('Sweet Caroline')")
add("01-24", "Sharon Tate", 1943, "Film actor & 1960s cultural figure")
add("01-24", "John Belushi", 1949, "Comedic star ('Saturday Night Live', 'The Blues Brothers')")
add("01-24", "Mary Lou Retton", 1968, "Olympic gold medalist gymnast")

add("01-25", "Virginia Woolf", 1882, "Modernist author ('To the Lighthouse', 'Mrs Dalloway')")
add("01-25", "Etta James", 1938, "Legendary blues & soul singer ('At Last')")
add("01-25", "Xavi", 1980, "World Cup-winning midfielder & FC Barcelona manager")
add("01-25", "Alicia Keys", 1981, "15-time Grammy-winning singer-songwriter & pianist")

add("01-26", "Paul Newman", 1925, "Academy Award-winning actor & philanthropist ('The Hustler')")
add("01-26", "Eddie Van Halen", 1955, "Legendary rock guitar virtuoso")
add("01-26", "Ellen DeGeneres", 1958, "Comedian & daytime talk show host")
add("01-26", "Wayne Gretzky", 1961, "NHL all-time leading scorer ('The Great One')")

add("01-27", "Wolfgang Amadeus Mozart", 1756, "Prolific and influential Classical composer")
add("01-27", "Lewis Carroll", 1832, "Author ('Alice's Adventures in Wonderland')")
add("01-27", "Mikhail Baryshnikov", 1948, "Celebrated ballet dancer & actor")
add("01-27", "Patton Oswalt", 1969, "Comedian, actor & writer")

add("01-28", "Alan Alda", 1936, "6-time Emmy-winning actor ('M*A*S*H')")
add("01-28", "Sarah McLachlan", 1968, "Grammy-winning singer-songwriter & Lilith Fair founder")
add("01-28", "Elijah Wood", 1981, "Actor ('The Lord of the Rings' trilogy)")
add("01-28", "J. Cole", 1985, "Grammy-winning hip-hop artist & producer")

add("01-29", "Anton Chekhov", 1860, "Master Russian playwright & short story writer")
add("01-29", "Tom Selleck", 1945, "Emmy-winning actor ('Magnum, P.I.', 'Blue Bloods')")
add("01-29", "Oprah Winfrey", 1954, "Media mogul, television pioneer & philanthropist")
add("01-29", "Marc Gasol", 1985, "NBA champion & Defensive Player of the Year")

add("01-30", "Franklin D. Roosevelt", 1882, "32nd U.S. President (New Deal & WWII leader)")
add("01-30", "Gene Hackman", 1930, "2-time Academy Award-winning actor ('The French Connection')")
add("01-30", "Phil Collins", 1951, "Grammy-winning singer, songwriter & Genesis drummer")
add("01-30", "Christian Bale", 1974, "Academy Award-winning actor ('The Dark Knight')")

add("01-31", "Franz Schubert", 1797, "Austrian Romantic composer")
add("01-31", "Jackie Robinson", 1919, "Baseball Hall of Famer who broke MLB's color barrier")
add("01-31", "Nolan Ryan", 1947, "MLB all-time strikeout king (5,714 strikeouts & 7 no-hitters)")
add("01-31", "Justin Timberlake", 1981, "10-time Grammy-winning singer & actor")

# Let us verify output directory
print("January data ready.")

# ==================== FEBRUARY ====================
add("02-01", "John Ford", 1894, "4-time Academy Award-winning film director")
add("02-01", "Clark Gable", 1901, "Classic Hollywood leading man ('Gone with the Wind')")
add("02-01", "Rick James", 1948, "Funk and soul singer-songwriter ('Super Freak')")
add("02-01", "Ronda Rousey", 1987, "Olympic medalist & UFC champion")
add("02-01", "Harry Styles", 1994, "Grammy-winning singer-songwriter & actor")

add("02-02", "James Joyce", 1882, "Irish novelist ('Ulysses', 'Dubliners')")
add("02-02", "Stan Getz", 1927, "Jazz saxophonist & bossa nova pioneer ('The Girl from Ipanema')")
add("02-02", "Shakira", 1977, "Multi-Grammy-winning Colombian superstar")
add("02-02", "Gerard Piqué", 1987, "World Cup champion Spanish footballer")

add("02-03", "Felix Mendelssohn", 1809, "German Romantic composer & conductor")
add("02-03", "Norman Rockwell", 1894, "Illustrator of classic American life")
add("02-03", "Fran Tarkenton", 1940, "Hall of Fame NFL quarterback")
add("02-03", "Isla Fisher", 1976, "Actor & author ('Wedding Crashers')")

add("02-04", "Rosa Parks", 1913, "Civil rights pioneer ('Mother of the Freedom Movement')")
add("02-04", "Alice Cooper", 1948, "Shock-rock pioneer & singer")
add("02-04", "Lawrence Taylor", 1959, "Hall of Fame NFL linebacker & MVP")
add("02-04", "Oscar De La Hoya", 1973, "Olympic gold medalist & 10-time boxing world champion")

add("02-05", "Hank Aaron", 1934, "Hall of Fame baseball legend (755 home runs)")
add("02-05", "Roger Staubach", 1942, "Heisman winner & 2-time Super Bowl champion QB")
add("02-05", "Michael Mann", 1943, "Film director ('Heat', 'The Last of the Mohicans')")
add("02-05", "Cristiano Ronaldo", 1985, "5-time Ballon d'Or football superstar")
add("02-05", "Neymar Jr.", 1992, "Brazilian football superstar & Olympic gold medalist")

add("02-06", "Babe Ruth", 1895, "Legendary baseball icon ('The Sultan of Swat')")
add("02-06", "Ronald Reagan", 1911, "40th U.S. President & actor")
add("02-06", "Bob Marley", 1945, "Reggae music pioneer & global icon")
add("02-06", "Axl Rose", 1962, "Guns N' Roses frontman & songwriter")

add("02-07", "Charles Dickens", 1812, "Victorian novelist ('Great Expectations', 'A Tale of Two Cities')")
add("02-07", "Laura Ingalls Wilder", 1867, "Author ('Little House on the Prairie')")
add("02-07", "Garth Brooks", 1962, "Country music superstar & best-selling solo artist")
add("02-07", "Chris Rock", 1965, "4-time Emmy-winning comedian & actor")
add("02-07", "Steve Nash", 1974, "2-time NBA MVP & Hall of Fame point guard")

add("02-08", "Jules Verne", 1828, "Author ('Twenty Thousand Leagues Under the Sea')")
add("02-08", "James Dean", 1931, "Cultural icon & actor ('Rebel Without a Cause')")
add("02-08", "John Williams", 1932, "5-time Oscar-winning composer ('Star Wars', 'Jaws', 'Indiana Jones')")
add("02-08", "Alonzo Mourning", 1970, "NBA Hall of Famer & Defensive Player of the Year")

add("02-09", "William Henry Harrison", 1773, "9th U.S. President")
add("02-09", "Carole King", 1942, "Songwriter & singer ('Tapestry')")
add("02-09", "Joe Pesci", 1943, "Academy Award-winning actor ('Goodfellas', 'Home Alone')")
add("02-09", "Michael B. Jordan", 1987, "Actor & director ('Creed', 'Black Panther')")

add("02-10", "Boris Pasternak", 1890, "Nobel laureate author ('Doctor Zhivago')")
add("02-10", "Leontyne Price", 1927, "World-renowned operatic soprano & Presidential Medal of Freedom recipient")
add("02-10", "Mark Spitz", 1950, "9-time Olympic gold medalist swimmer")
add("02-10", "Laura Dern", 1967, "Academy Award & Emmy-winning actor ('Jurassic Park')")

add("02-11", "Thomas Edison", 1847, "Prolific inventor (light bulb, phonograph, motion picture camera)")
add("02-11", "Leslie Nielsen", 1926, "Comedic screen legend ('Airplane!', 'The Naked Gun')")
add("02-11", "Burt Reynolds", 1936, "Hollywood leading man ('Smokey and the Bandit')")
add("02-11", "Sheryl Crow", 1962, "9-time Grammy-winning singer-songwriter")
add("02-11", "Jennifer Aniston", 1969, "Emmy-winning actor ('Friends')")

add("02-12", "Abraham Lincoln", 1809, "16th U.S. President (preserved the Union & issued Emancipation Proclamation)")
add("02-12", "Charles Darwin", 1809, "Naturalist & geologist (theory of evolution by natural selection)")
add("02-12", "Bill Russell", 1934, "11-time NBA champion & civil rights icon")
add("02-12", "Josh Brolin", 1968, "Oscar-nominated actor ('No Country for Old Men')")

add("02-13", "Chuck Yeager", 1923, "Air Force ace who first broke the sound barrier")
add("02-13", "Peter Gabriel", 1950, "Singer-songwriter, Genesis frontman & humanitarian")
add("02-13", "Mike Krzyzewski", 1947, "Hall of Fame basketball coach (5 national championships)")
add("02-13", "Randy Moss", 1977, "Hall of Fame NFL wide receiver")

add("02-14", "Frederick Douglass", 1818, "Abolitionist leader, orator & statesman")
add("02-14", "Jack Benny", 1894, "Comedian & radio/television pioneer")
add("02-14", "Florence Henderson", 1934, "Actor ('The Brady Bunch')")
add("02-14", "Rob Thomas", 1972, "Matchbox Twenty frontman & songwriter")

add("02-15", "Galileo Galilei", 1564, "Astronomer, physicist & father of modern science")
add("02-15", "Susan B. Anthony", 1820, "Women's suffrage pioneer & social reformer")
add("02-15", "Matt Groening", 1954, "Creator of 'The Simpsons' and 'Futurama'")
add("02-15", "Jaromír Jágr", 1972, "NHL legend & 2nd all-time leading scorer")

add("02-16", "John McEnroe", 1959, "7-time Grand Slam tennis champion & broadcaster")
add("02-16", "LeVar Burton", 1957, "Actor & host ('Roots', 'Star Trek: TNG', 'Reading Rainbow')")
add("02-16", "Ice-T", 1958, "Hip-hop pioneer & actor ('Law & Order: SVU')")
add("02-16", "The Weeknd", 1990, "4-time Grammy-winning singer & producer")

add("02-17", "Michael Jordan", 1963, "6-time NBA champion, 5-time MVP & global sports icon")
add("02-17", "Jim Brown", 1936, "NFL Hall of Fame running back & civil rights advocate")
add("02-17", "Billie Joe Armstrong", 1972, "Green Day frontman & guitarist")
add("02-17", "Ed Sheeran", 1991, "Multi-Grammy-winning singer-songwriter")

add("02-18", "Toni Morrison", 1931, "Nobel laureate & Pulitzer Prize-winning author ('Beloved')")
add("02-18", "Yoko Ono", 1933, "Multimedia artist, singer & peace activist")
add("02-18", "John Travolta", 1954, "Oscar-nominated actor ('Saturday Night Fever', 'Pulp Fiction')")
add("02-18", "Dr. Dre", 1965, "Hip-hop producer, rapper & entrepreneur")

add("02-19", "Nicolaus Copernicus", 1473, "Astronomer who formulated the heliocentric model")
add("02-19", "Smokey Robinson", 1940, "Motown legend & Rock and Roll Hall of Fame singer-songwriter")
add("02-19", "Jeff Daniels", 1955, "Emmy-winning actor ('The Newsroom', 'Dumb and Dumber')")
add("02-19", "Nikola Jokić", 1995, "3-time NBA MVP & NBA champion")

add("02-20", "Ansel Adams", 1902, "Master landscape photographer & conservationist")
add("02-20", "Sidney Poitier", 1927, "First Black actor to win Best Actor Oscar ('Lilies of the Field')")
add("02-20", "Charles Barkley", 1963, "NBA MVP, Hall of Famer & television analyst")
add("02-20", "Kurt Cobain", 1967, "Nirvana frontman & grunge pioneer")
add("02-20", "Rihanna", 1988, "9-time Grammy-winning superstar & entrepreneur")

add("02-21", "W.H. Auden", 1907, "Influential 20th-century poet")
add("02-21", "Sam Peckinpah", 1925, "Film director ('The Wild Bunch')")
add("02-21", "Nina Simone", 1933, "Legendary jazz/blues singer & civil rights activist")
add("02-21", "Kelsey Grammer", 1955, "5-time Emmy-winning actor ('Frasier', 'Cheers')")

add("02-22", "George Washington", 1732, "1st U.S. President & Commander of the Continental Army")
add("02-22", "Chopin", 1810, "Polish Romantic composer & virtuoso pianist")
add("02-22", "Ted Kennedy", 1932, "Long-serving U.S. Senator from Massachusetts")
add("02-22", "Julius Erving", 1950, "Basketball legend ('Dr. J')")
add("02-22", "Drew Barrymore", 1975, "Actor, producer & talk show host")

add("02-23", "George Frideric Handel", 1685, "Baroque composer ('Messiah', 'Water Music')")
add("02-23", "W.E.B. Du Bois", 1868, "Sociologist, historian, civil rights activist & NAACP co-founder")
add("02-23", "Peter Fonda", 1940, "Actor & screenwriter ('Easy Rider')")
add("02-23", "Dakota Fanning", 1994, "Actor ('I Am Sam', 'Once Upon a Time in Hollywood')")

add("02-24", "Winslow Homer", 1836, "American landscape painter & printmaker")
add("02-24", "Steve Jobs", 1955, "Apple co-founder & tech visionary")
add("02-24", "Alain Prost", 1955, "4-time Formula One World Champion")
add("02-24", "Floyd Mayweather Jr.", 1977, "Undefeated 50-0 boxing world champion")

add("02-25", "Pierre-Auguste Renoir", 1841, "French Impressionist master painter")
add("02-25", "George Harrison", 1943, "The Beatles lead guitarist & songwriter")
add("02-25", "Ric Flair", 1949, "16-time world wrestling champion ('The Nature Boy')")
add("02-25", "Rashida Jones", 1976, "Actor & screenwriter ('Parks and Recreation')")

add("02-26", "Victor Hugo", 1802, "French novelist ('Les Misérables', 'The Hunchback of Notre-Dame')")
add("02-26", "Johnny Cash", 1932, "Country music legend ('The Man in Black')")
add("02-26", "Michael Bolton", 1953, "Grammy-winning singer-songwriter")
add("02-26", "Erykah Badu", 1971, "Queen of Neo-Soul singer-songwriter")

add("02-27", "Henry Wadsworth Longfellow", 1807, "Fireside poet ('Paul Revere\'s Ride')")
add("02-27", "John Steinbeck", 1902, "Nobel laureate author ('The Grapes of Wrath')")
add("02-27", "Elizabeth Taylor", 1932, "2-time Academy Award-winning Hollywood icon")
add("02-27", "James Worthy", 1961, "3-time NBA champion & Hall of Famer ('Big Game James')")

add("02-28", "Michel de Montaigne", 1533, "French philosopher & father of modern essays")
add("02-28", "Linus Pauling", 1901, "2-time unshared Nobel Prize laureate (Chemistry & Peace)")
add("02-28", "Mario Andretti", 1940, "Racing legend (F1 World Champion, Indy 500 & Daytona 500 winner)")
add("02-28", "Luka Dončić", 1999, "NBA All-Star & Dallas Mavericks superstar")

add("02-29", "Gioachino Rossini", 1792, "Italian composer ('The Barber of Seville', 'William Tell')")
add("02-29", "Dinah Shore", 1916, "Singer, television host & LPGA pioneer")
add("02-29", "Tony Robbins", 1960, "Author & motivational speaker")
add("02-29", "Ja Rule", 1976, "Grammy-nominated rapper & actor")

print("February loaded.")

# ==================== MARCH ====================
add("03-01", "Frédéric Chopin", 1810, "Polish Romantic composer & pianist")
add("03-01", "Glenn Miller", 1904, "Big band leader & trombonist ('In the Mood')")
add("03-01", "Harry Belafonte", 1927, "Singer, actor & civil rights activist ('Day-O')")
add("03-01", "Ron Howard", 1954, "Academy Award-winning director & actor ('A Beautiful Mind')")
add("03-01", "Justin Bieber", 1994, "Global pop superstar")

add("03-02", "Sam Houston", 1793, "Leader of the Texas Revolution & President of the Republic of Texas")
add("03-02", "Dr. Seuss", 1904, "Beloved children's author & illustrator")
add("03-02", "Lou Reed", 1942, "Velvet Underground frontman & songwriter ('Walk on the Wild Side')")
add("03-02", "Jon Bon Jovi", 1962, "Rock singer-songwriter & bandleader")
add("03-02", "Daniel Craig", 1968, "Actor (James Bond, 'Knives Out')")

add("03-03", "Alexander Graham Bell", 1847, "Inventor of the telephone")
add("03-03", "Doc Watson", 1923, "Grammy-winning bluegrass & folk guitar virtuoso")
add("03-03", "Jackie Joyner-Kersee", 1962, "3-time Olympic gold medalist track & field legend")
add("03-03", "Camila Cabello", 1997, "Pop singer-songwriter ('Havana')")

add("03-04", "Antonio Vivaldi", 1678, "Baroque composer ('The Four Seasons')")
add("03-04", "Knute Rockne", 1888, "Legendary Notre Dame football coach")
add("03-04", "Catherine O'Hara", 1954, "Emmy-winning comedic actor ('Schitt's Creek', 'Home Alone')")
add("03-04", "Landon Donovan", 1982, "All-time leading U.S. men's soccer scorer")

add("03-05", "Gerardus Mercator", 1512, "Geographer & creator of the Mercator map projection")
add("03-05", "Rex Harrison", 1908, "Oscar-winning actor ('My Fair Lady')")
add("03-05", "Penn Jillette", 1955, "Magician, illusionist & author (Penn & Teller)")
add("03-05", "Eva Mendes", 1974, "Actor & fashion designer ('Hitch')")

add("03-06", "Michelangelo", 1475, "High Renaissance sculptor, painter & architect (Sistine Chapel)")
add("03-06", "Gabriel García Márquez", 1927, "Nobel laureate author ('One Hundred Years of Solitude')")
add("03-06", "David Gilmour", 1946, "Pink Floyd lead guitarist & singer")
add("03-06", "Shaquille O'Neal", 1972, "4-time NBA champion, MVP & Hall of Fame center")

add("03-07", "Piet Mondrian", 1872, "Pioneering Dutch abstract painter")
add("03-07", "Maurice Ravel", 1875, "French Impressionist composer ('Boléro')")
add("03-07", "Bryan Cranston", 1956, "6-time Emmy-winning actor ('Breaking Bad')")
add("03-07", "Viv Richards", 1952, "Legendary West Indies cricket batsman")

add("03-08", "Oliver Wendell Holmes Jr.", 1841, "Influential U.S. Supreme Court justice")
add("03-08", "Lynn Redgrave", 1943, "Acclaimed English actor")
add("03-08", "Micky Dolenz", 1945, "The Monkees drummer & lead singer")
add("03-08", "Hines Ward", 1976, "Super Bowl XL MVP wide receiver")

add("03-09", "Amerigo Vespucci", 1454, "Explorer after whom America is named")
add("03-09", "Bobby Fischer", 1943, "World Chess Champion & grandmaster")
add("03-09", "Ornette Coleman", 1930, "Jazz innovator & free jazz pioneer")
add("03-09", "Oscar Isaac", 1979, "Acclaimed actor ('Inside Llewyn Davis', 'Dune')")

add("03-10", "Harriet Tubman", 1822, "Underground Railroad conductor & abolitionist hero")
add("03-10", "Chuck Norris", 1940, "Martial arts champion & actor")
add("03-10", "Sharon Stone", 1958, "Oscar-nominated actor ('Casino')")
add("03-10", "Carrie Underwood", 1983, "8-time Grammy-winning country superstar")

add("03-11", "Torquato Tasso", 1544, "Italian Renaissance poet")
add("03-11", "Lawrence Welk", 1903, "Bandleader & television host")
add("03-11", "Bobby McFerrin", 1950, "10-time Grammy-winning vocalist ('Don\'t Worry, Be Happy')")
add("03-11", "Didier Drogba", 1978, "Chelsea & Ivory Coast football legend")

add("03-12", "Jack Kerouac", 1922, "Beat Generation author ('On the Road')")
add("03-12", "Liza Minnelli", 1946, "EGOT-winning performer ('Cabaret')")
add("03-12", "James Taylor", 1948, "6-time Grammy-winning singer-songwriter ('Fire and Rain')")
add("03-12", "Mitt Romney", 1947, "U.S. Senator & 2012 presidential nominee")

add("03-13", "Joseph Priestley", 1733, "Chemist who discovered oxygen")
add("03-13", "William H. Macy", 1950, "Oscar-nominated & Emmy-winning actor ('Fargo', 'Shameless')")
add("03-13", "Charo", 1951, "Virtuoso guitarist & entertainer")
add("03-13", "Common", 1972, "Oscar & Grammy-winning Chicago rapper & actor")

add("03-14", "Albert Einstein", 1879, "Nobel laureate physicist (theory of relativity)")
add("03-14", "Michael Caine", 1933, "2-time Academy Award-winning English actor")
add("03-14", "Quincy Jones", 1933, "28-time Grammy-winning music producer & composer")
add("03-14", "Stephen Curry", 1988, "4-time NBA champion & all-time 3-point leader")
add("03-14", "Simone Biles", 1997, "Most decorated gymnast in history (11 Olympic medals)")

add("03-15", "Andrew Jackson", 1767, "7th U.S. President")
add("03-15", "Sly Stone", 1943, "Funk pioneer & frontman (Sly and the Family Stone)")
add("03-15", "Ry Cooder", 1947, "Multi-Grammy-winning guitarist & producer")
add("03-15", "Ruth Bader Ginsburg", 1933, "U.S. Supreme Court Justice & women's rights pioneer")

add("03-16", "James Madison", 1751, "4th U.S. President & 'Father of the Constitution'")
add("03-16", "Jerry Lewis", 1926, "Comedic legend, filmmaker & humanitarian")
add("03-16", "Flavor Flav", 1959, "Public Enemy co-founder & hype man")
add("03-16", "Blake Griffin", 1989, "6-time NBA All-Star & Slam Dunk champion")

add("03-17", "Gottlieb Daimler", 1834, "Automotive engineer & industrialist")
add("03-17", "Nat King Cole", 1919, "Legendary jazz pianist & crooner ('Unforgettable')")
add("03-17", "Kurt Russell", 1951, "Actor ('Escape from New York', 'The Thing')")
add("03-17", "Mia Hamm", 1972, "2-time World Cup champion & soccer icon")
add("03-17", "Katie Ledecky", 1997, "9-time Olympic gold medalist swimmer")

add("03-18", "Grover Cleveland", 1837, "22nd and 24th U.S. President")
add("03-18", "Charley Pride", 1934, "Country music Hall of Famer")
add("03-18", "Queen Latifah", 1970, "Grammy & Emmy-winning rapper, singer & actor")
add("03-18", "Adam Levine", 1979, "Maroon 5 frontman & songwriter")

add("03-19", "David Livingstone", 1813, "Scottish explorer & missionary in Africa")
add("03-19", "Wyatt Earp", 1848, "Old West lawman of O.K. Corral fame")
add("03-19", "Bruce Willis", 1955, "Action movie star ('Die Hard', 'Pulp Fiction')")
add("03-19", "Glenn Close", 1947, "8-time Oscar-nominated actor ('Fatal Attraction')")

add("03-20", "Henrik Ibsen", 1828, "Norwegian playwright ('A Doll\'s House')")
add("03-20", "Fred Rogers", 1928, "Beloved creator and host of 'Mister Rogers\' Neighborhood'")
add("03-20", "Bobby Orr", 1948, "Hockey Hall of Fame defenseman & 2-time Stanley Cup MVP")
add("03-20", "Spike Lee", 1957, "Academy Award-winning director ('Do the Right Thing')")

add("03-21", "Johann Sebastian Bach", 1685, "Master composer of the Baroque era")
add("03-21", "Gary Oldman", 1958, "Academy Award-winning English actor ('Darkest Hour')")
add("03-21", "Ayrton Senna", 1960, "3-time Formula One World Champion")
add("03-21", "Ronaldinho", 1980, "2-time FIFA World Player of the Year & World Cup winner")

add("03-22", "Anthony van Dyck", 1599, "Flemish Baroque portrait painter")
add("03-22", "William Shatner", 1931, "Actor ('Captain Kirk' in 'Star Trek')")
add("03-22", "Andrew Lloyd Webber", 1948, "EGOT-winning composer ('Phantom of the Opera', 'Cats')")
add("03-22", "Reese Witherspoon", 1976, "Academy Award-winning actor & producer ('Walk the Line')")

add("03-23", "Akira Kurosawa", 1910, "Legendary Japanese film director ('Seven Samurai')")
add("03-23", "Wernher von Braun", 1912, "Aerospace engineer & Saturn V rocket architect")
add("03-23", "Chaka Khan", 1953, "10-time Grammy-winning Queen of Funk")
add("03-23", "Kyrie Irving", 1992, "NBA champion & 8-time All-Star point guard")

add("03-24", "Harry Houdini", 1874, "Legendary illusionist & stunt escape artist")
add("03-24", "Steve McQueen", 1930, "Action film star ('The Great Escape', 'Bullitt')")
add("03-24", "Bob Costas", 1952, "29-time Emmy-winning sports broadcaster")
add("03-24", "Peyton Manning", 1976, "5-time NFL MVP & 2-time Super Bowl champion QB")

add("03-25", "Béla Bartók", 1881, "Hungarian composer & ethnomusicologist")
add("03-25", "Howard Cosell", 1918, "Iconic sports broadcaster ('Monday Night Football')")
add("03-25", "Aretha Franklin", 1942, "The Queen of Soul & 18-time Grammy winner")
add("03-25", "Elton John", 1947, "EGOT-winning singer, songwriter & pianist")
add("03-25", "Sarah Jessica Parker", 1965, "Emmy-winning actor ('Sex and the City')")

add("03-26", "Robert Frost", 1874, "4-time Pulitzer Prize-winning poet ('The Road Not Taken')")
add("03-26", "Tennessee Williams", 1911, "Playwright ('A Streetcar Named Desire')")
add("03-26", "Diana Ross", 1944, "Lead singer of The Supremes & solo icon")
add("03-26", "Steven Tyler", 1948, "Aerosmith frontman & lead singer")
add("03-26", "John Stockton", 1962, "NBA all-time assists and steals leader")

add("03-27", "Wilhelm Röntgen", 1845, "Physicist who discovered X-rays (1st Nobel in Physics)")
add("03-27", "Sarah Vaughan", 1924, "Legendary jazz singer ('The Divine One')")
add("03-27", "Quentin Tarantino", 1963, "2-time Oscar-winning filmmaker ('Pulp Fiction')")
add("03-27", "Mariah Carey", 1969, "5-time Grammy-winning singer with 19 #1 hits")

add("03-28", "Saint Teresa of Ávila", 1515, "Spanish mystic & Carmelite reformer")
add("03-28", "Mario Vargas Llosa", 1936, "Nobel laureate Peruvian novelist")
add("03-28", "Reba McEntire", 1955, "Queen of Country music & actor")
add("03-28", "Lady Gaga", 1986, "Oscar & 13-time Grammy-winning pop superstar")

add("03-29", "John Tyler", 1790, "10th U.S. President")
add("03-29", "Cy Young", 1867, "MLB all-time wins leader (511 wins)")
add("03-29", "Sam Walton", 1918, "Founder of Walmart and Sam's Club")
add("03-29", "Walt Frazier", 1945, "2-time NBA champion & Knicks Hall of Famer")

add("03-30", "Vincent van Gogh", 1853, "Dutch Post-Impressionist master ('The Starry Night')")
add("03-30", "Warren Beatty", 1937, "Academy Award-winning director & actor ('Reds')")
add("03-30", "Eric Clapton", 1945, "3-time Rock and Roll Hall of Fame guitarist")
add("03-30", "Céline Dion", 1968, "5-time Grammy-winning Canadian vocal icon")

add("03-31", "René Descartes", 1596, "Philosopher & mathematician ('Cogito, ergo sum')")
add("03-31", "Joseph Haydn", 1732, "Classical composer ('Father of the Symphony')")
add("03-31", "César Chávez", 1927, "Labor leader & civil rights activist (UFW founder)")
add("03-31", "Christopher Walken", 1943, "Academy Award-winning actor ('The Deer Hunter')")
add("03-31", "Ewan McGregor", 1971, "Emmy-winning Scottish actor ('Star Wars', 'Trainspotting')")

print("March loaded.")

# ==================== APRIL ====================
add("04-01", "Sergei Rachmaninoff", 1873, "Russian composer & virtuoso pianist")
add("04-01", "Debbie Reynolds", 1932, "Actor & singer ('Singin\' in the Rain')")
add("04-01", "Ali MacGraw", 1939, "Golden Globe-winning actor ('Love Story')")
add("04-01", "David Oyelowo", 1976, "Acclaimed actor ('Selma')")

add("04-02", "Charlemagne", 742, "King of the Franks & Holy Roman Emperor")
add("04-02", "Hans Christian Andersen", 1805, "Danish author of fairy tales ('The Little Mermaid')")
add("04-02", "Marvin Gaye", 1939, "Motown legend & soul singer ('What\'s Going On')")
add("04-02", "Emmylou Harris", 1947, "14-time Grammy-winning country & Americana artist")
add("04-02", "Pedro Pascal", 1975, "Actor ('The Mandalorian', 'The Last of Us')")

add("04-03", "Washington Irving", 1783, "Author ('The Legend of Sleepy Hollow', 'Rip Van Winkle')")
add("04-03", "Marlon Brando", 1924, "2-time Oscar-winning screen giant ('The Godfather')")
add("04-03", "Jane Goodall", 1934, "Primatologist & UN Messenger of Peace")
add("04-03", "Eddie Murphy", 1961, "Iconic comedian, actor & Oscar nominee ('Beverly Hills Cop')")

add("04-04", "Maya Angelou", 1928, "Poet & civil rights activist ('I Know Why the Caged Bird Sings')")
add("04-04", "Muddy Waters", 1913, "Father of modern Chicago blues")
add("04-04", "Robert Downey Jr.", 1965, "Academy Award-winning actor ('Iron Man', 'Oppenheimer')")
add("04-04", "Heath Ledger", 1979, "Academy Award-winning actor ('The Dark Knight')")

add("04-05", "Thomas Hobbes", 1588, "English political philosopher ('Leviathan')")
add("04-05", "Spencer Tracy", 1900, "2-time Academy Award-winning actor")
add("04-05", "Bette Davis", 1908, "2-time Academy Award-winning Hollywood screen legend")
add("04-05", "Colin Powell", 1937, "4-star General & first Black U.S. Secretary of State")
add("04-05", "Pharrell Williams", 1973, "13-time Grammy-winning musician & producer")

add("04-06", "Raphael", 1483, "Italian Renaissance master painter & architect")
add("04-06", "Merle Haggard", 1937, "Country music outlaw & songwriter ('Mama Tried')")
add("04-06", "Barry Levinson", 1942, "Academy Award-winning director ('Rain Man')")
add("04-06", "Paul Rudd", 1969, "Actor & comedian ('Ant-Man', 'Anchorman')")

add("04-07", "William Wordsworth", 1770, "English Romantic poet ('Lines Composed a Few Miles above Tintern Abbey')")
add("04-07", "Billie Holiday", 1915, "Influential jazz and swing vocal stylist ('Strange Fruit')")
add("04-07", "Francis Ford Coppola", 1939, "5-time Oscar-winning director ('The Godfather' trilogy, 'Apocalypse Now')")
add("04-07", "Jackie Chan", 1954, "Martial arts master & action movie icon")
add("04-07", "Russell Crowe", 1964, "Academy Award-winning actor ('Gladiator')")

add("04-08", "Buddha", -563, "Spiritual teacher & founder of Buddhism (trad. date)")
add("04-08", "Sonja Henie", 1912, "3-time Olympic gold figure skater & Hollywood star")
add("04-08", "Kofi Annan", 1938, "UN Secretary-General & Nobel Peace laureate")
add("04-08", "John Madden", 1936, "Super Bowl-winning coach & broadcasting icon")
add("04-08", "Robin Wright", 1966, "Emmy-nominated actor & director ('House of Cards')")

add("04-09", "Charles Baudelaire", 1821, "French poet ('Les Fleurs du mal')")
add("04-09", "Paul Robeson", 1898, "Bass-baritone concert artist, actor & activist")
add("04-09", "Dennis Quaid", 1954, "Actor ('The Right Stuff', 'The Rookie')")
add("04-09", "Jacques Villeneuve", 1971, "Formula One World Champion & Indy 500 winner")

add("04-10", "William Booth", 1829, "Founder and first General of The Salvation Army")
add("04-10", "Max von Sydow", 1929, "Oscar-nominated Swedish actor ('The Seventh Seal')")
add("04-10", "John Madden", 1936, "Hall of Fame NFL coach & broadcasting legend")
add("04-10", "Kenny Chesney", 1968, "8-time CMA Entertainer of the Year country star")
add("04-10", "Sadio Mané", 1992, "Senegalese football star & African Footballer of the Year")

add("04-11", "Charles Evans Hughes", 1862, "U.S. Chief Justice & Secretary of State")
add("04-11", "Dean Acheson", 1893, "U.S. Secretary of State & architect of the Cold War")
add("04-11", "Mark Teixeira", 1980, "World Series champion MLB switch-hitting first baseman")
add("04-11", "Saoirse Ronan", 1994, "4-time Academy Award-nominated actor ('Little Women', 'Lady Bird')")

add("04-12", "Henry Clay", 1777, "Statesman & orator ('The Great Compromiser')")
add("04-12", "Beverly Cleary", 1916, "Beloved children's author ('Ramona Quimby')")
add("04-12", "Herbie Hancock", 1940, "14-time Grammy-winning jazz & funk keyboard visionary")
add("04-12", "David Letterman", 1947, "Iconic late-night television talk show host")

add("04-13", "Thomas Jefferson", 1743, "3rd U.S. President & principal author of Declaration of Independence")
add("04-13", "Samuel Beckett", 1906, "Nobel laureate Irish playwright ('Waiting for Godot')")
add("04-13", "Al Green", 1946, "11-time Grammy-winning soul singer ('Let\'s Stay Together')")
add("04-13", "Garry Kasparov", 1963, "World Chess Champion & grandmaster")

add("04-14", "Christian Huygens", 1629, "Dutch physicist, astronomer & mathematician")
add("04-14", "John Gielgud", 1904, "EGOT-winning English actor & theatre director")
add("04-14", "Pete Rose", 1941, "MLB all-time hits leader (4,256 hits)")
add("04-14", "Adrien Brody", 1973, "Youngest Best Actor Oscar winner ('The Pianist')")

add("04-15", "Leonardo da Vinci", 1452, "High Renaissance polymath, painter & inventor ('Mona Lisa')")
add("04-15", "Henry James", 1843, "Author ('The Portrait of a Lady', 'The Turn of the Screw')")
add("04-15", "Bessie Smith", 1894, "Empress of the Blues")
add("04-15", "Emma Thompson", 1959, "2-time Academy Award-winning British actor & screenwriter")
add("04-15", "Emma Watson", 1990, "Actor ('Harry Potter' series) & UN Women Goodwill Ambassador")

add("04-16", "Wilbur Wright", 1867, "Aviation pioneer & inventor of the airplane")
add("04-16", "Charlie Chaplin", 1889, "Iconic silent film comedic actor & filmmaker ('The Tramp')")
add("04-16", "Kareem Abdul-Jabbar", 1947, "6-time NBA champion, 6-time MVP & all-time basketball great")
add("04-16", "Bill Belichick", 1952, "6-time Super Bowl-winning NFL head coach")
add("04-16", "Selena", 1971, "Queen of Tejano music & Grammy winner")

add("04-17", "J.P. Morgan", 1837, "Financier, banker & industrial titan")
add("04-17", "Thornton Wilder", 1897, "3-time Pulitzer Prize-winning playwright & novelist ('Our Town')")
add("04-17", "Boomer Esiason", 1961, "NFL MVP quarterback & broadcaster")
add("04-17", "Jennifer Garner", 1972, "Golden Globe-winning actor ('Alias', '13 Going on 30')")

add("04-18", "Lucrezia Borgia", 1480, "Italian Renaissance noblewoman & Duchess of Ferrara")
add("04-18", "Clarence Darrow", 1857, "Legendary defense attorney (Scopes Trial, Leopold & Loeb)")
add("04-18", "Leopold Stokowski", 1882, "Conductor & arranger ('Fantasia')")
add("04-18", "Conan O'Brien", 1963, "Emmy-winning television host, comedian & writer")
add("04-18", "Miguel Cabrera", 1983, "2-time AL MVP & MLB Triple Crown winner")

add("04-19", "E.T.A. Hoffmann", 1776, "Author ('The Nutcracker and the Mouse King')")
add("04-19", "Eliot Ness", 1903, "Prohibition agent & leader of 'The Untouchables'")
add("04-19", "Al Unser Jr.", 1962, "2-time Indianapolis 500 champion")
add("04-19", "Maria Sharapova", 1987, "5-time Grand Slam tennis champion")

add("04-20", "Joan Miró", 1893, "Catalan Surrealist painter & sculptor")
add("04-20", "Lionel Hampton", 1908, "Jazz vibraphonist, pianist & bandleader")
add("04-20", "George Takei", 1937, "Actor ('Star Trek') & civil rights advocate")
add("04-20", "Don Mattingly", 1961, "AL MVP, 9-time Gold Glove first baseman & manager ('Donnie Baseball')")
add("04-20", "Andy Serkis", 1964, "Actor & director ('The Lord of the Rings', 'Planet of the Apes')")

add("04-21", "Charlotte Brontë", 1816, "English novelist ('Jane Eyre')")
add("04-21", "John Muir", 1838, "Naturalist, author & Sierra Club founder ('Father of National Parks')")
add("04-21", "Queen Elizabeth II", 1926, "Longest-reigning British monarch (70 years on throne)")
add("04-21", "Iggy Pop", 1947, "Godfather of Punk & The Stooges frontman")

add("04-22", "Immanuel Kant", 1724, "German Enlightenment philosopher ('Critique of Pure Reason')")
add("04-22", "Vladimir Lenin", 1870, "Leader of the 1917 Bolshevik Revolution")
add("04-22", "Robert Oppenheimer", 1904, "Theoretical physicist & director of the Manhattan Project")
add("04-22", "Charles Mingus", 1922, "Jazz bassist, composer & bandleader")
add("04-22", "Jack Nicholson", 1937, "3-time Academy Award-winning actor ('One Flew Over the Cuckoo\'s Nest')")

add("04-23", "William Shakespeare", 1564, "English playwright & poet (trad. birth & death date)")
add("04-23", "J.M.W. Turner", 1775, "English Romantic landscape painter")
add("04-23", "Max Planck", 1858, "Nobel laureate physicist & originator of quantum theory")
add("04-23", "Roy Orbison", 1936, "Rock and roll singer-songwriter ('Oh, Pretty Woman')")

add("04-24", "Anthony Trollope", 1815, "Victorian novelist")
add("04-24", "Willem de Kooning", 1904, "Abstract Expressionist painter")
add("04-24", "Shirley MacLaine", 1934, "Academy Award-winning actor ('Terms of Endearment')")
add("04-24", "Barbra Streisand", 1942, "EGOT-winning singer, actor & director")
add("04-24", "Kelly Clarkson", 1982, "3-time Grammy-winning pop singer & talk show host")

add("04-25", "Guglielmo Marconi", 1874, "Nobel laureate inventor & radio pioneer")
add("04-25", "Ella Fitzgerald", 1917, "13-time Grammy-winning 'First Lady of Song'")
add("04-25", "Al Pacino", 1940, "Academy Award-winning actor ('The Godfather', 'Scarface', 'Scent of a Woman')")
add("04-25", "Tim Duncan", 1976, "5-time NBA champion, 2-time MVP & Hall of Fame power forward")

add("04-26", "Marcus Aurelius", 121, "Roman Emperor & Stoic philosopher ('Meditations')")
add("04-26", "John James Audubon", 1785, "Ornithologist, naturalist & painter ('The Birds of America')")
add("04-26", "Carol Burnett", 1933, "6-time Emmy-winning comedic icon & host")
add("04-26", "Jet Li", 1963, "Martial arts champion & international action star")
add("04-26", "Aaron Judge", 1992, "AL MVP & single-season AL home run record holder (62 HRs)")

add("04-27", "Samuel Morse", 1791, "Co-developer of Morse code & telegraph inventor")
add("04-27", "Ulysses S. Grant", 1822, "18th U.S. President & Union Army Commanding General")
add("04-27", "Coretta Scott King", 1927, "Civil rights leader & author")
add("04-27", "Lizzo", 1988, "4-time Grammy-winning singer, rapper & flutist")

add("04-28", "James Monroe", 1758, "5th U.S. President (Monroe Doctrine)")
add("04-28", "Harper Lee", 1926, "Pulitzer Prize-winning author ('To Kill a Mockingbird')")
add("04-28", "Jay Leno", 1950, "Longtime host of 'The Tonight Show'")
add("04-28", "Penélope Cruz", 1974, "Academy Award-winning Spanish actor ('Vicky Cristina Barcelona')")

add("04-29", "William Randolph Hearst", 1863, "Newspaper publisher & media magnate")
add("04-29", "Duke Ellington", 1899, "Jazz composer, pianist & big-band leader")
add("04-29", "Jerry Seinfeld", 1954, "Comedian & creator of 'Seinfeld'")
add("04-29", "Daniel Day-Lewis", 1957, "Only 3-time Best Actor Oscar winner ('There Will Be Blood', 'Lincoln')")
add("04-29", "Andre Agassi", 1970, "8-time Grand Slam champion & Olympic gold tennis star")

add("04-30", "Carl Friedrich Gauss", 1777, "German mathematician ('Prince of Mathematicians')")
add("04-30", "Willie Nelson", 1933, "Country music icon & songwriter ('On the Road Again')")
add("04-30", "Isiah Thomas", 1961, "2-time NBA champion & Hall of Fame Pistons point guard")
add("04-30", "Gal Gadot", 1985, "Actor ('Wonder Woman')")

# ==================== MAY ====================
add("05-01", "Arthur Wellesley, 1st Duke of Wellington", 1769, "British general who defeated Napoleon at Waterloo")
add("05-01", "Calamity Jane", 1852, "Old West frontierswoman & scout")
add("05-01", "Judy Collins", 1939, "Grammy-winning folk singer-songwriter")
add("05-01", "Tim McGraw", 1967, "3-time Grammy-winning country music superstar")

add("05-02", "Catherine the Great", 1729, "Empress of Russia (longest-ruling female leader)")
add("05-02", "Theodore Herzl", 1860, "Father of modern political Zionism")
add("05-02", "Bing Crosby", 1903, "Academy Award-winning actor & singer ('White Christmas')")
add("05-02", "David Beckham", 1975, "English football icon & global ambassador")
add("05-02", "Dwayne Johnson", 1972, "Actor & WWE legend ('The Rock')")

add("05-03", "Niccolò Machiavelli", 1469, "Renaissance political philosopher ('The Prince')")
add("05-03", "Golda Meir", 1898, "4th Prime Minister of Israel ('Iron Lady' of Israeli politics)")
add("05-03", "James Brown", 1933, "The Godfather of Soul & Hardest Working Man in Show Business")
add("05-03", "Sugar Ray Robinson", 1921, "Pound-for-pound greatest boxer of all time")

add("05-04", "Bartolomeo Cristofori", 1655, "Italian inventor of the piano")
add("05-04", "Audrey Hepburn", 1929, "EGOT-winning screen icon & UNICEF ambassador ('Breakfast at Tiffany\'s')")
add("05-04", "Keith Haring", 1958, "Pop artist & activist")
add("05-04", "Rory McIlroy", 1989, "4-time golf Major champion")

add("05-05", "Søren Kierkegaard", 1813, "Danish philosopher & father of Christian existentialism")
add("05-05", "Karl Marx", 1818, "Philosopher, political theorist & co-author of 'The Communist Manifesto'")
add("05-05", "Adele", 1988, "16-time Grammy-winning British vocal superstar")
add("05-05", "Henry Cavill", 1983, "Actor ('Superman', 'The Witcher')")

add("05-06", "Sigmund Freud", 1856, "Father of modern psychoanalysis")
add("05-06", "Orson Welles", 1915, "Visionary filmmaker & actor ('Citizen Kane')")
add("05-06", "Willie Mays", 1931, "Hall of Fame center fielder ('The Say Hey Kid', 660 home runs)")
add("05-06", "George Clooney", 1961, "2-time Academy Award-winning actor & filmmaker")
add("05-06", "Chris Paul", 1985, "12-time NBA All-Star & Olympic gold medalist point guard")

add("05-07", "Johannes Brahms", 1833, "German Romantic master composer & pianist")
add("05-07", "Pyotr Ilyich Tchaikovsky", 1840, "Russian Romantic composer ('Swan Lake', '1812 Overture')")
add("05-07", "Gary Cooper", 1901, "2-time Academy Award-winning Hollywood star ('High Noon')")
add("05-07", "Johnny Unitas", 1933, "Hall of Fame NFL quarterback & 3-time MVP")

add("05-08", "Harry S. Truman", 1884, "33rd U.S. President (guided end of WWII & Marshall Plan)")
add("05-08", "David Attenborough", 1926, "Acclaimed British natural historian & broadcaster")
add("05-08", "Don Rickles", 1926, "Legendary stand-up comedian & insult comic")
add("05-08", "Thomas Pynchon", 1937, "Novelist ('Gravity\'s Rainbow')")

add("05-09", "Howard Carter", 1874, "Archaeologist who discovered King Tutankhamun's tomb")
add("05-09", "Mike Wallace", 1918, "Pioneering investigative journalist ('60 Minutes')")
add("05-09", "Billy Joel", 1949, "Grammy Legend Award-winning singer-songwriter ('Piano Man')")
add("05-09", "Steve Yzerman", 1965, "3-time Stanley Cup champion & Red Wings captain")

add("05-10", "Fred Astaire", 1899, "Legendary dancer, choreographer & Hollywood star")
add("05-10", "Bono", 1960, "U2 lead singer, philanthropist & activist")
add("05-10", "Dennis Rodman", 1961, "5-time NBA champion & 7-time rebounding champion")
add("05-10", "Kenan Thompson", 1978, "Longest-tenured 'Saturday Night Live' cast member")

add("05-11", "Irving Berlin", 1888, "Composer & lyricist ('God Bless America', 'White Christmas')")
add("05-11", "Salvador Dalí", 1904, "Spanish Surrealist master ('The Persistence of Memory')")
add("05-11", "Richard Feynman", 1918, "Nobel laureate theoretical physicist")
add("05-11", "Cam Newton", 1989, "NFL MVP quarterback & Heisman Trophy winner")

add("05-12", "Florence Nightingale", 1820, "Founder of modern nursing ('The Lady with the Lamp')")
add("05-12", "Yogi Berra", 1925, "10-time World Series champion catcher & Hall of Famer")
add("05-12", "George Carlin", 1937, "5-time Grammy-winning stand-up comedy pioneer")
add("05-12", "Tony Hawk", 1968, "Skateboarding pioneer & 12-time X Games champion")

add("05-13", "Arthur Sullivan", 1842, "English composer (Gilbert and Sullivan operettas)")
add("05-13", "Joe Louis", 1914, "World Heavyweight champion for 12 straight years ('The Brown Bomber')")
add("05-13", "Stevie Wonder", 1950, "25-time Grammy-winning musical genius & songwriter")
add("05-13", "Dennis Rodman", 1961, "NBA Hall of Fame forward & 5-time champion")
add("05-13", "Stephen Colbert", 1964, "Emmy-winning late-night talk show host & satirist")

add("05-14", "Thomas Gainsborough", 1727, "English portrait and landscape painter ('The Blue Boy')")
add("05-14", "George Lucas", 1944, "Filmmaker & creator of 'Star Wars' and 'Indiana Jones'")
add("05-14", "Robert Zemeckis", 1952, "Academy Award-winning director ('Back to the Future', 'Forrest Gump')")
add("05-14", "Cate Blanchett", 1969, "2-time Academy Award-winning Australian actor")
add("05-14", "Mark Zuckerberg", 1984, "Meta/Facebook co-founder & tech entrepreneur")

add("05-15", "Claudio Monteverdi", 1567, "Italian composer & pioneer of opera ('L\'Orfeo')")
add("05-15", "L. Frank Baum", 1856, "Author ('The Wonderful Wizard of Oz')")
add("05-15", "Jasper Johns", 1930, "Painter, sculptor & printmaker")
add("05-15", "George Brett", 1953, "Hall of Fame 3rd baseman & 3,000-hit club member")
add("05-15", "Emmitt Smith", 1969, "NFL all-time rushing yards leader (18,355 yards)")

add("05-16", "Henry Fonda", 1905, "Academy Award-winning actor ('The Grapes of Wrath', '12 Angry Men')")
add("05-16", "Studs Terkel", 1912, "Chicago author, oral historian & Pulitzer Prize winner")
add("05-16", "Pierce Brosnan", 1953, "Actor (James Bond, 'The Thomas Crown Affair')")
add("05-16", "Janet Jackson", 1966, "5-time Grammy-winning pop icon")

add("05-17", "Edward Jenner", 1749, "Physician & pioneer of the smallpox vaccine")
add("05-17", "Erik Satie", 1866, "French avant-garde composer & pianist ('Gymnopédies')")
add("05-17", "Sugar Ray Leonard", 1956, "Olympic gold medalist & 5-weight world boxing champion")
add("05-17", "Enya", 1961, "Grammy-winning Irish singer-songwriter & musician")
add("05-17", "Tony Parker", 1982, "4-time NBA champion & Finals MVP point guard")

add("05-18", "Bertrand Russell", 1872, "Nobel laureate philosopher, mathematician & logician")
add("05-18", "Frank Capra", 1897, "3-time Oscar-winning director ('It\'s a Wonderful Life')")
add("05-18", "Pope John Paul II", 1920, "Head of Catholic Church & key figure in ending communism")
add("05-18", "Reggie Jackson", 1946, "Hall of Fame slugger ('Mr. October', 5 World Series titles)")
add("05-18", "Tina Fey", 1970, "9-time Emmy-winning comedic actor, writer & creator ('30 Rock')")

add("05-19", "Ho Chi Minh", 1890, "Vietnamese revolutionary leader & President")
add("05-19", "Malcolm X", 1925, "Prominent civil rights leader, orator & minister")
add("05-19", "Pete Townshend", 1945, "The Who guitarist, principal songwriter & visionary")
add("05-19", "Kevin Garnett", 1976, "NBA MVP, 15-time All-Star & Hall of Fame power forward")

add("05-20", "Honoré de Balzac", 1799, "French novelist & playwright ('La Comédie humaine')")
add("05-20", "James Stewart", 1908, "Beloved Academy Award-winning actor ('It\'s a Wonderful Life', 'Vertigo')")
add("05-20", "Cher", 1946, "Grammy & Oscar-winning 'Goddess of Pop'")
add("05-20", "Busta Rhymes", 1972, "Grammy-nominated hip-hop pioneer & rapper")

add("05-21", "Albrecht Dürer", 1471, "German Renaissance master painter & printmaker")
add("05-21", "Fats Waller", 1904, "Jazz pianist, organist, composer & entertainer ('Ain\'t Misbehavin\'')")
add("05-21", "Mr. T", 1952, "Actor & Chicago native ('The A-Team', 'Rocky III')")
add("05-21", "The Notorious B.I.G.", 1972, "Legendary hip-hop titan ('Biggie Smalls')")

add("05-22", "Richard Wagner", 1813, "German Romantic opera composer ('The Ring Cycle')")
add("05-22", "Arthur Conan Doyle", 1859, "Author & creator of Sherlock Holmes")
add("05-22", "Laurence Olivier", 1907, "Legendary English stage & screen actor (4 Oscars)")
add("05-22", "Novak Djokovic", 1987, "All-time men's record 24-time Grand Slam tennis champion")

add("05-23", "Carl Linnaeus", 1707, "Botanist & father of modern biological taxonomy")
add("05-23", "Douglas Fairbanks", 1883, "Silent screen swashbuckler & United Artists co-founder")
add("05-23", "Rosemary Clooney", 1928, "Singer & actor ('White Christmas')")
add("05-23", "Drew Carey", 1958, "Comedian & host ('The Price Is Right')")

add("05-24", "Queen Victoria", 1819, "Monarch of the British Empire for 63 years")
add("05-24", "Bob Dylan", 1941, "Nobel laureate singer-songwriter & cultural icon")
add("05-24", "Patti LaBelle", 1944, "Godmother of Soul & 2-time Grammy winner")
add("05-24", "Tracy McGrady", 1979, "2-time NBA scoring champion & Hall of Famer")

add("05-25", "Ralph Waldo Emerson", 1803, "Transcendentalist essayist, philosopher & poet")
add("05-25", "Miles Davis", 1926, "Iconic jazz trumpeter & bandleader ('Kind of Blue')")
add("05-25", "Ian McKellen", 1939, "6-time Olivier & Tony-winning actor (Gandalf, Magneto)")
add("05-25", "Octavia Spencer", 1970, "Academy Award-winning actor ('The Help')")

add("05-26", "John Wayne", 1907, "Academy Award-winning Hollywood icon ('The Duke')")
add("05-26", "Peggy Lee", 1920, "Grammy-winning jazz & pop singer ('Fever')")
add("05-26", "Stevie Nicks", 1948, "Fleetwood Mac singer-songwriter & solo icon")
add("05-26", "Lenny Kravitz", 1964, "4-time Grammy-winning rock singer & guitarist")

add("05-27", "Cornelius Vanderbilt", 1794, "Railroad & shipping tycoon, Vanderbilt founder")
add("05-27", "Rachel Carson", 1907, "Marine biologist & environmentalist author ('Silent Spring')")
add("05-27", "Henry Kissinger", 1923, "U.S. Secretary of State & Nobel Peace laureate")
add("05-27", "Frank Thomas", 1968, "2-time AL MVP & Chicago White Sox Hall of Famer ('The Big Hurt')")

add("05-28", "William Pitt the Younger", 1759, "Youngest British Prime Minister (took office at 24)")
add("05-28", "Jim Thorpe", 1887, "Olympic gold medalist & all-around sports legend")
add("05-28", "Gladys Knight", 1944, "Empress of Soul & 7-time Grammy winner")
add("05-28", "Jerry West", 1938, "NBA champion, Hall of Famer & the NBA logo silhouette")

add("05-29", "Patrick Henry", 1736, "Founding Father & orator ('Give me liberty, or give me death!')")
add("05-29", "John F. Kennedy", 1917, "35th U.S. President (Moon speech & Peace Corps)")
add("05-29", "Al Unser", 1939, "4-time Indianapolis 500 champion")
add("05-29", "Melissa Etheridge", 1961, "2-time Grammy-winning rock singer-songwriter")
add("05-29", "Carmelo Anthony", 1984, "10-time NBA All-Star & 3-time Olympic gold medalist")

add("05-30", "Peter the Great", 1672, "Tsar of Russia who modernized and Westernized the empire")
add("05-30", "Benny Goodman", 1909, "The 'King of Swing' clarinetist & bandleader")
add("05-30", "Manny Ramirez", 1972, "World Series MVP & 12-time MLB All-Star")
add("05-30", "Idina Menzel", 1971, "Tony-winning Broadway star & singer ('Wicked', 'Frozen')")

add("05-31", "Walt Whitman", 1819, "American poet & humanist ('Leaves of Grass')")
add("05-31", "Clint Eastwood", 1930, "4-time Academy Award-winning filmmaker & actor ('Unforgiven')")
add("05-31", "Joe Namath", 1943, "Super Bowl III MVP quarterback ('Broadway Joe')")
add("05-31", "Colin Farrell", 1976, "Golden Globe-winning Irish actor")

print("April and May loaded.")

# ==================== JUNE ====================
add("06-01", "Jacques Cousteau", 1910, "Ocean explorer, filmmaker & co-inventor of the Aqua-Lung")
add("06-01", "Marilyn Monroe", 1926, "Iconic Hollywood film star & cultural legend")
add("06-01", "Morgan Freeman", 1937, "Academy Award-winning actor ('Million Dollar Baby', 'Shawshank Redemption')")
add("06-01", "Ronnie Wood", 1947, "Rolling Stones guitarist & artist")
add("06-01", "Alanis Morissette", 1974, "7-time Grammy-winning singer-songwriter ('Jagged Little Pill')")

add("06-02", "Thomas Hardy", 1840, "English novelist & poet ('Tess of the d\'Urbervilles')")
add("06-02", "Charlie Watts", 1941, "The Rolling Stones longtime drummer")
add("06-02", "Jerry Mathers", 1948, "Actor ('Leave It to Beaver')")
add("06-02", "Sergio Agüero", 1988, "Premier League & Manchester City all-time top scorer")

add("06-03", "Jefferson Davis", 1808, "President of the Confederate States")
add("06-03", "Josephine Baker", 1906, "Entertainer, French Resistance agent & civil rights activist")
add("06-03", "Curtis Mayfield", 1942, "Soul singer-songwriter & Chicago native ('Superfly')")
add("06-03", "Rafael Nadal", 1986, "22-time Grand Slam tennis champion & 'King of Clay'")

add("06-04", "George III", 1738, "King of Great Britain during American Revolutionary War")
add("06-04", "Dennis Weaver", 1924, "Actor ('Gunsmoke', 'Duel')")
add("06-04", "Bruce Dern", 1936, "2-time Oscar-nominated actor ('Nebraska')")
add("06-04", "Angelina Jolie", 1975, "Academy Award-winning actor & humanitarian")

add("06-05", "Adam Smith", 1723, "Scottish economist & author ('The Wealth of Nations')")
add("06-05", "John Maynard Keynes", 1883, "Influential 20th-century macroeconomic pioneer")
add("06-05", "Art Garfunkel", 1941, "Grammy-winning singer (Simon & Garfunkel)")
add("06-05", "Mark Wahlberg", 1971, "Oscar-nominated actor & producer ('The Departed')")

add("06-06", "Diego Velázquez", 1599, "Spanish Golden Age master painter ('Las Meninas')")
add("06-06", "Alexander Pushkin", 1799, "Founder of modern Russian literature ('Eugene Onegin')")
add("06-06", "Thomas Mann", 1875, "Nobel laureate German novelist ('The Magic Mountain')")
add("06-06", "Björn Borg", 1956, "11-time Grand Slam tennis champion (5 straight Wimbledons)")

add("06-07", "Paul Gauguin", 1848, "French Post-Impressionist master painter")
add("06-07", "Dean Martin", 1917, "Singer, actor & 'King of Cool' (The Rat Pack)")
add("06-07", "Tom Jones", 1940, "Welsh pop icon ('It\'s Not Unusual')")
add("06-07", "Prince", 1958, "7-time Grammy-winning musical visionary ('Purple Rain')")
add("06-07", "Allen Iverson", 1975, "NBA MVP, 4-time scoring champion & Hall of Fame guard")

add("06-08", "Robert Schumann", 1810, "German Romantic master composer")
add("06-08", "Frank Lloyd Wright", 1867, "Pioneering architect (Fallingwater, Guggenheim Museum)")
add("06-08", "Nancy Sinatra", 1940, "Singer ('These Boots Are Made for Walkin\'')")
add("06-08", "Kanye West", 1977, "24-time Grammy-winning producer & artist")

add("06-09", "George Stephenson", 1781, "Pioneering British railway engineer ('Father of Railways')")
add("06-09", "Cole Porter", 1891, "Broadway & popular song composer ('Night and Day')")
add("06-09", "Les Paul", 1915, "Guitar innovator & pioneer of the solid-body electric guitar")
add("06-09", "Michael J. Fox", 1961, "5-time Emmy-winning actor ('Back to the Future') & advocate")
add("06-09", "Johnny Depp", 1963, "3-time Oscar-nominated actor ('Pirates of the Caribbean')")

add("06-10", "Gustave Courbet", 1819, "French master painter & pioneer of Realism")
add("06-10", "Judy Garland", 1922, "Oscar-winning Hollywood legend ('The Wizard of Oz')")
add("06-10", "Tara Lipinski", 1982, "Youngest Olympic gold medalist in individual figure skating")
add("06-10", "Kate Upton", 1992, "Model & actor")

add("06-11", "John Constable", 1776, "English landscape painter ('The Hay Wain')")
add("06-11", "Richard Strauss", 1864, "German composer ('Also sprach Zarathustra')")
add("06-11", "Vince Lombardi", 1913, "Hall of Fame coach & Super Bowl trophy namesake")
add("06-11", "Joe Montana", 1956, "4-time Super Bowl champion & 3-time Super Bowl MVP QB")

add("06-12", "Anne Frank", 1929, "Holocaust diarist ('The Diary of a Young Girl')")
add("06-12", "George H.W. Bush", 1924, "41st U.S. President (end of Cold War & Gulf War)")
add("06-12", "Chick Corea", 1941, "27-time Grammy-winning jazz fusion pianist")
add("06-12", "Jim Nabors", 1930, "Actor & singer ('Gomer Pyle')")

add("06-13", "William Butler Yeats", 1865, "Nobel laureate Irish poet & dramatist")
add("06-13", "Harold Grange", 1903, "College & NFL football legend ('The Galloping Ghost')")
add("06-13", "Tim Allen", 1953, "Actor & comedian ('Home Improvement', 'Toy Story')")
add("06-13", "Chris Evans", 1981, "Actor ('Captain America' in the MCU)")

add("06-14", "Harriet Beecher Stowe", 1811, "Abolitionist author ('Uncle Tom\'s Cabin')")
add("06-14", "Burl Ives", 1909, "Oscar-winning actor & folk singer ('A Holly Jolly Christmas')")
add("06-14", "Donald Trump", 1946, "45th U.S. President & businessman")
add("06-14", "Steffi Graf", 1969, "22-time Grand Slam champion & only Golden Slam winner")

add("06-15", "Edvard Grieg", 1843, "Norwegian composer ('Peer Gynt', 'In the Hall of the Mountain King')")
add("06-15", "Waylon Jennings", 1937, "Country music outlaw pioneer")
add("06-15", "Mario Cuomo", 1932, "3-term Governor of New York & orator")
add("06-15", "Ice Cube", 1969, "Hip-hop trailblazer (N.W.A), actor & filmmaker")

add("06-16", "Adam Smith", 1723, "Pioneering political economist")
add("06-16", "Stan Laurel", 1890, "Legendary comedic film actor (Laurel and Hardy)")
add("06-16", "Roberto Durán", 1951, "4-weight boxing world champion ('Hands of Stone')")
add("06-16", "Phil Mickelson", 1970, "6-time golf Major champion & World Golf Hall of Famer")
add("06-16", "Tupac Shakur", 1971, "Influential hip-hop artist, poet & cultural icon")

add("06-17", "Igor Stravinsky", 1882, "Revolutionary Russian composer ('The Rite of Spring')")
add("06-17", "M.C. Escher", 1898, "Dutch graphic artist of impossible mathematical structures")
add("06-17", "Barry Manilow", 1943, "Grammy & Emmy-winning singer-songwriter ('Copacabana')")
add("06-17", "Venus Williams", 1980, "7-time Grand Slam singles champion & 4-time Olympic gold medalist")
add("06-17", "Kendrick Lamar", 1987, "Pulitzer Prize & 17-time Grammy-winning hip-hop artist")

add("06-18", "Paul McCartney", 1942, "The Beatles singer-songwriter, multi-instrumentalist & icon")
add("06-18", "Isabella Rossellini", 1952, "Actor, filmmaker & model ('Blue Velvet')")
add("06-18", "Blake Shelton", 1976, "Country music superstar & TV host")
add("06-18", "Richard Madden", 1986, "Golden Globe-winning actor ('Bodyguard', 'Game of Thrones')")

add("06-19", "Blaise Pascal", 1623, "French mathematician, physicist & philosopher")
add("06-19", "Lou Gehrig", 1903, "Hall of Fame Yankees first baseman ('The Iron Horse', 2,130 straight games)")
add("06-19", "Salman Rushdie", 1947, "Booker Prize-winning novelist ('Midnight\'s Children')")
add("06-19", "Dirk Nowitzki", 1978, "NBA champion, MVP & Hall of Fame power forward (31,560 pts)")

add("06-20", "Jacques Offenbach", 1819, "French Romantic composer & cellist ('Can-can')")
add("06-20", "Errol Flynn", 1909, "Swashbuckling Hollywood leading man ('Robin Hood')")
add("06-20", "Brian Wilson", 1942, "The Beach Boys genius composer & co-founder ('Pet Sounds')")
add("06-20", "Lionel Richie", 1949, "4-time Grammy-winning singer-songwriter ('All Night Long')")
add("06-20", "Nicole Kidman", 1967, "Academy Award & 2-time Emmy-winning actor")

add("06-21", "Jean-Paul Sartre", 1905, "Existentialist philosopher & Nobel laureate author")
add("06-21", "Ray Davies", 1944, "The Kinks frontman & principal songwriter")
add("06-21", "Meredith Baxter", 1947, "Actor ('Family Ties')")
add("06-21", "Prince William", 1982, "Prince of Wales & heir apparent to British throne")

add("06-22", "H. Rider Haggard", 1856, "Author ('King Solomon\'s Mines')")
add("06-22", "Billy Wilder", 1906, "6-time Academy Award-winning director ('Some Like It Hot', 'Sunset Boulevard')")
add("06-22", "Meryl Streep", 1949, "3-time Academy Award-winning acting titan (21 Oscar nominations)")
add("06-22", "Cyndi Lauper", 1953, "Grammy, Emmy & Tony-winning pop icon ('Girls Just Want to Have Fun')")

add("06-23", "Alan Turing", 1912, "Mathematician, computer science pioneer & Enigma codebreaker")
add("06-23", "Bob Fosse", 1927, "8-time Tony & Oscar-winning director/choreographer ('Cabaret')")
add("06-23", "Clarence Thomas", 1948, "Associate Justice of the U.S. Supreme Court")
add("06-23", "Zinedine Zidane", 1972, "World Cup champion & 3-time FIFA World Player of the Year")

add("06-24", "St. John the Baptist", -6, "Biblical prophet & precursor of Jesus (trad. feast/birth)")
add("06-24", "Jack Dempsey", 1895, "World Heavyweight boxing champion & cultural icon")
add("06-24", "Jeff Beck", 1944, "8-time Grammy-winning virtuoso rock guitarist")
add("06-24", "Mick Fleetwood", 1947, "Fleetwood Mac co-founder & drummer")
add("06-24", "Lionel Messi", 1987, "8-time Ballon d'Or winner & World Cup champion")

add("06-25", "Antoni Gaudí", 1852, "Catalan architect of the Sagrada Família")
add("06-25", "George Orwell", 1903, "Novelist & essayist ('1984', 'Animal Farm')")
add("06-25", "Carly Simon", 1945, "Grammy & Oscar-winning singer-songwriter ('You\'re So Vain')")
add("06-25", "Dikembe Mutombo", 1966, "4-time NBA Defensive Player of the Year & humanitarian")

add("06-26", "Lord Kelvin", 1824, "Physicist who formulated the absolute temperature scale")
add("06-26", "Pearl S. Buck", 1892, "Nobel laureate author ('The Good Earth')")
add("06-26", "Derek Jeter", 1974, "5-time World Series champion Yankees captain & Hall of Famer")
add("06-26", "Ariana Grande", 1993, "2-time Grammy-winning pop superstar")

add("06-27", "Charles Stewart Parnell", 1846, "Irish nationalist political leader")
add("06-27", "Helen Keller", 1880, "Author, disability rights advocate & political activist")
add("06-27", "Vera Wang", 1949, "Fashion designer & former figure skater")
add("06-27", "J.J. Abrams", 1966, "Filmmaker & creator ('Lost', 'Star Trek', 'Star Wars')")
add("06-27", "Tobey Maguire", 1975, "Actor ('Spider-Man')")

add("06-28", "Henry VIII", 1491, "King of England who established Church of England")
add("06-28", "Jean-Jacques Rousseau", 1712, "Genevan philosopher of the Enlightenment ('The Social Contract')")
add("06-28", "Mel Brooks", 1926, "EGOT-winning comedy filmmaker ('Blazing Saddles', 'The Producers')")
add("06-28", "John Elway", 1960, "2-time Super Bowl champion quarterback & Hall of Famer")
add("06-28", "Elon Musk", 1971, "Tesla, SpaceX & neural tech entrepreneur")

add("06-29", "Antoine de Saint-Exupéry", 1900, "Aviator & author ('The Little Prince')")
add("06-29", "Slim Pickens", 1919, "Rodeo performer & actor ('Dr. Strangelove')")
add("06-29", "Harmon Killebrew", 1936, "Hall of Fame slugger (573 career home runs)")
add("06-29", "Colin Jost", 1982, "'Saturday Night Live' head writer & Weekend Update co-anchor")
add("06-29", "Kawhi Leonard", 1991, "2-time NBA Finals MVP & 2-time Defensive Player of the Year")

add("06-30", "Czesław Miłosz", 1911, "Nobel laureate Polish-American poet & diplomat")
add("06-30", "Lena Horne", 1917, "Grammy-winning singer, actor & civil rights activist")
add("06-30", "Mike Tyson", 1966, "Undisputed World Heavyweight boxing champion")
add("06-30", "Michael Phelps", 1985, "All-time most decorated Olympian (28 Olympic medals, 23 golds)")

print("June loaded.")

# ==================== JULY ====================
add("07-01", "Gottfried Wilhelm Leibniz", 1646, "German polymath & co-inventor of calculus")
add("07-01", "Estée Lauder", 1906, "Cosmetics pioneer & entrepreneur")
add("07-01", "Sydney Pollack", 1934, "Academy Award-winning director ('Out of Africa')")
add("07-01", "Debbie Harry", 1945, "Blondie frontwoman & new wave icon")
add("07-01", "Carl Lewis", 1961, "9-time Olympic gold medalist track & field legend")
add("07-01", "Princess Diana", 1961, "Princess of Wales & global humanitarian")

add("07-02", "Hermann Hesse", 1877, "Nobel laureate author ('Siddhartha', 'Steppenwolf')")
add("07-02", "Thurgood Marshall", 1908, "First Black U.S. Supreme Court Justice & civil rights giant")
add("07-02", "Richard Petty", 1937, "7-time NASCAR Cup Series champion ('The King')")
add("07-02", "Larry David", 1947, "Co-creator of 'Seinfeld' & star of 'Curb Your Enthusiasm'")
add("07-02", "Margot Robbie", 1990, "3-time Oscar-nominated actor & producer ('Barbie')")

add("07-03", "John Singleton Copley", 1738, "Colonial American portrait painter")
add("07-03", "Franz Kafka", 1883, "Author ('The Metamorphosis', 'The Trial')")
add("07-03", "Tom Stoppard", 1937, "Oscar & 5-time Tony-winning playwright ('Rosencrantz and Guildenstern Are Dead')")
add("07-03", "Tom Cruise", 1962, "Action star & Hollywood producer ('Top Gun', 'Mission: Impossible')")
add("07-03", "Sebastian Vettel", 1987, "4-time Formula One World Champion")

add("07-04", "Nathaniel Hawthorne", 1804, "Novelist ('The Scarlet Letter')")
add("07-04", "Calvin Coolidge", 1872, "30th U.S. President (born on Independence Day)")
add("07-04", "Rube Goldberg", 1883, "Cartoonist, sculptor & complex machine designer")
add("07-04", "Bill Withers", 1938, "Grammy-winning soul singer-songwriter ('Lean on Me', 'Ain\'t No Sunshine')")
add("07-04", "Post Malone", 1995, "Multi-platinum singer, rapper & songwriter")

add("07-05", "Phineas Taylor Barnum", 1810, "Showman, circus pioneer & politician")
add("07-05", "Jean Cocteau", 1889, "French artist, filmmaker & poet ('Beauty and the Beast')")
add("07-05", "Robbie Robertson", 1943, "The Band lead guitarist & principal songwriter ('The Weight')")
add("07-05", "Huey Lewis", 1950, "Grammy-winning rock singer & frontman ('The Power of Love')")
add("07-05", "Shohei Ohtani", 1994, "2-way baseball superstar, 2-time MVP & 50/50 club founder")

add("07-06", "John Paul Jones", 1747, "Father of the U.S. Navy ('I have not yet begun to fight!')")
add("07-06", "Frida Kahlo", 1907, "Celebrated Mexican painter & feminist icon")
add("07-06", "Sylvester Stallone", 1946, "Oscar-nominated actor, writer & director ('Rocky', 'Rambo')")
add("07-06", "George W. Bush", 1946, "43rd U.S. President")
add("07-06", "50 Cent", 1975, "Grammy-winning rapper, actor & producer")

add("07-07", "Gustav Mahler", 1860, "Austrian late-Romantic composer & conductor")
add("07-07", "Marc Chagall", 1887, "Russian-French modernist painter & stained glass master")
add("07-07", "Satchel Paige", 1906, "Negro Leagues & MLB Hall of Fame pitching legend")
add("07-07", "Ringo Starr", 1940, "The Beatles drummer, singer & solo artist")

add("07-08", "John D. Rockefeller", 1839, "Standard Oil founder & major philanthropist")
add("07-08", "Philip Johnson", 1906, "Pritzker Prize-winning modern architect (Glass House)")
add("07-08", "Kevin Bacon", 1958, "Actor ('Footloose', 'Apollo 13')")
add("07-08", "Toby Keith", 1961, "Country music superstar & songwriter")
add("07-08", "Beck", 1970, "8-time Grammy-winning alternative rock musician")

add("07-09", "Elias Howe", 1819, "Inventor of the modern sewing machine")
add("07-09", "Courtney Love", 1964, "Hole frontwoman & Golden Globe-nominated actor")
add("07-09", "Tom Hanks", 1956, "2-time Best Actor Oscar winner ('Forrest Gump', 'Philadelphia')")
add("07-09", "Jack White", 1975, "12-time Grammy-winning rocker & The White Stripes founder")

add("07-10", "John Calvin", 1509, "French theologian & Protestant Reformation leader")
add("07-10", "Nikola Tesla", 1856, "Electrical engineer & AC power system inventor")
add("07-10", "Marcel Proust", 1871, "French novelist ('In Search of Lost Time')")
add("07-10", "Arthur Ashe", 1943, "3-time Grand Slam tennis champion & civil rights advocate")
add("07-10", "Sofia Vergara", 1972, "4-time Emmy-nominated actor ('Modern Family')")

add("07-11", "John Quincy Adams", 1767, "6th U.S. President & statesman")
add("07-11", "E.B. White", 1899, "Author ('Charlotte\'s Web', 'The Elements of Style')")
add("07-11", "Yul Brynner", 1920, "Oscar & Tony-winning actor ('The King and I')")
add("07-11", "Giorgio Armani", 1934, "Legendary Italian luxury fashion designer")
add("07-11", "Suzanne Vega", 1959, "Grammy-winning singer-songwriter ('Luka')")

add("07-12", "Henry David Thoreau", 1817, "Author & philosopher ('Walden', 'Civil Disobedience')")
add("07-12", "George Eastman", 1854, "Founder of Eastman Kodak & roll film pioneer")
add("07-12", "Pablo Neruda", 1904, "Nobel laureate Chilean poet & diplomat")
add("07-12", "Bill Cosby", 1937, "Comedian & actor")
add("07-12", "Malala Yousafzai", 1997, "Youngest Nobel Peace Prize laureate & education activist")

add("07-13", "John Dee", 1527, "Mathematician, astronomer & adviser to Queen Elizabeth I")
add("07-13", "Patrick Stewart", 1940, "Acclaimed Shakespearean actor ('Star Trek: TNG', 'X-Men')")
add("07-13", "Harrison Ford", 1942, "Hollywood icon ('Star Wars', 'Indiana Jones', 'Blade Runner')")
add("07-13", "Cameron Crowe", 1957, "Academy Award-winning director & writer ('Almost Famous')")

add("07-14", "Cardinal Mazarin", 1602, "Chief Minister of France & diplomat")
add("07-14", "Gustav Klimt", 1862, "Austrian Symbolist master painter ('The Kiss')")
add("07-14", "Woody Guthrie", 1912, "Folk singer-songwriter & activist ('This Land Is Your Land')")
add("07-14", "Gerald Ford", 1913, "38th U.S. President")
add("07-14", "Ingmar Bergman", 1918, "Master Swedish film director ('The Seventh Seal')")

add("07-15", "Rembrandt van Rijn", 1606, "Dutch Golden Age master painter & etcher ('The Night Watch')")
add("07-15", "Walter Johnson", 1887, "Hall of Fame pitching legend (417 wins, 'The Big Train')")
add("07-15", "Clive Cussler", 1931, "Adventure novelist & marine archaeologist")
add("07-15", "Linda Ronstadt", 1946, "11-time Grammy-winning multi-genre vocal legend")
add("07-15", "Forest Whitaker", 1961, "Academy Award-winning actor ('The Last King of Scotland')")

add("07-16", "Sir Joshua Reynolds", 1723, "First President of the Royal Academy of Arts")
add("07-16", "Roald Amundsen", 1872, "Norwegian explorer who first reached the South Pole")
add("07-16", "Ginger Rogers", 1911, "Academy Award-winning actor & dance partner of Fred Astaire")
add("07-16", "Will Ferrell", 1967, "Comedic star & actor ('Anchorman', 'Elf', 'Step Brothers')")
add("07-16", "Barry Sanders", 1968, "NFL MVP & Hall of Fame running back (15,269 rush yards)")

add("07-17", "James Cagney", 1899, "Academy Award-winning Hollywood star ('Yankee Doodle Dandy')")
add("07-17", "Phyllis Diller", 1917, "Pioneering stand-up comedian & actor")
add("07-17", "Donald Sutherland", 1935, "Honorary Oscar-winning Canadian actor ('M*A*S*H')")
add("07-17", "Angela Merkel", 1954, "Chancellor of Germany for 16 years")

add("07-18", "Jane Austen", 1775, "English novelist ('Pride and Prejudice', 'Sense and Sensibility') (trad. note: died this day, b. Dec 16; use Nelson Mandela / Hunter S. Thompson)")
add("07-18", "Nelson Mandela", 1918, "Anti-apartheid hero, 1st Black President of South Africa & Nobel Peace laureate")
add("07-18", "John Glenn", 1921, "First American to orbit the Earth & longtime U.S. Senator")
add("07-18", "Hunter S. Thompson", 1937, "Gonzo journalism founder & author ('Fear and Loathing in Las Vegas')")
add("07-18", "Richard Branson", 1950, "Virgin Group founder & billionaire entrepreneur")
add("07-18", "Vin Diesel", 1967, "Action star & producer ('Fast & Furious' franchise)")

add("07-19", "Edgar Degas", 1834, "French Impressionist painter & sculptor of dancers")
add("07-19", "George McGovern", 1922, "U.S. Senator & 1972 Democratic presidential nominee")
add("07-19", "Brian May", 1947, "Queen lead guitarist, songwriter & astrophysicist")
add("07-19", "Benedict Cumberbatch", 1976, "Emmy-winning & Oscar-nominated actor ('Sherlock', 'Doctor Strange')")

add("07-20", "Gregor Mendel", 1822, "Father of modern genetics (pea plant experiments)")
add("07-20", "Sir Edmund Hillary", 1919, "New Zealand mountaineer who first summited Mt. Everest")
add("07-20", "Carlos Santana", 1947, "10-time Grammy-winning rock & Latin guitar virtuoso")
add("07-20", "Walter Payton", 1954, "Chicago Bears Hall of Fame MVP running back ('Sweetness')")
add("07-20", "Gisele Bündchen", 1980, "Supermodel & environmental activist")

add("07-21", "Alexander the Great", -356, "King of Macedonia & legendary military conqueror (trad. date)")
add("07-21", "Ernest Hemingway", 1899, "Nobel laureate author ('The Old Man and the Sea', 'For Whom the Bell Tolls')")
add("07-21", "Don Knotts", 1924, "5-time Emmy-winning comedic actor ('The Andy Griffith Show')")
add("07-21", "Robin Williams", 1951, "Oscar-winning comedic genius & dramatic actor ('Good Will Hunting')")

add("07-22", "Edward Hopper", 1882, "American realist painter ('Nighthawks')")
add("07-22", "Alexander Calder", 1898, "Sculptor & originator of mobile kinetic art")
add("07-22", "Bob Dole", 1923, "Senate Majority Leader & 1996 presidential nominee")
add("07-22", "Alex Trebek", 1940, "8-time Emmy-winning host of 'Jeopardy!' for 37 seasons")
add("07-22", "Selena Gomez", 1992, "Singer, actor & mental health advocate ('Only Murders in the Building')")

add("07-23", "Raymond Chandler", 1888, "Hardboiled crime fiction novelist ('The Big Sleep')")
add("07-23", "Don Drysdale", 1936, "Hall of Fame Dodgers pitcher & Cy Young Award winner")
add("07-23", "Woody Harrelson", 1961, "3-time Oscar-nominated actor ('Cheers', 'True Detective')")
add("07-23", "Slash", 1965, "Guns N' Roses lead guitarist & rock legend")
add("07-23", "Daniel Radcliffe", 1989, "Actor ('Harry Potter' series, Tony Award winner)")

add("07-24", "Simón Bolívar", 1783, "South American revolutionary leader ('El Libertador')")
add("07-24", "Alexandre Dumas", 1802, "French novelist ('The Three Musketeers', 'The Count of Monte Cristo')")
add("07-24", "Amelia Earhart", 1897, "Aviation pioneer & first woman to fly solo across the Atlantic")
add("07-24", "Barry Bonds", 1964, "7-time MLB MVP & all-time home run leader (762 HRs)")
add("07-24", "Jennifer Lopez", 1969, "Pop superstar, actor & global entertainer")

add("07-25", "Arthur Balfour", 1848, "British Prime Minister & author of Balfour Declaration")
add("07-25", "Walter Brennan", 1894, "Only 3-time Best Supporting Actor Oscar winner")
add("07-25", "Estelle Getty", 1923, "Emmy-winning actor ('The Golden Girls')")
add("07-25", "Walter Payton", 1954, "Chicago Bears Hall of Fame legend")
add("07-25", "Matt LeBlanc", 1967, "Emmy-nominated actor ('Friends')")

add("07-26", "George Bernard Shaw", 1856, "Nobel & Oscar-winning Irish playwright ('Pygmalion')")
add("07-26", "Carl Jung", 1875, "Swiss psychiatrist & founder of analytical psychology")
add("07-26", "Aldous Huxley", 1894, "Author ('Brave New World')")
add("07-26", "Stanley Kubrick", 1928, "Visionary filmmaker ('2001: A Space Odyssey', 'The Shining')")
add("07-26", "Mick Jagger", 1943, "The Rolling Stones frontman & rock icon")

add("07-27", "Alexandre Dumas fils", 1824, "French author & dramatist ('La Dame aux Camélias')")
add("07-27", "Norman Lear", 1922, "6-time Emmy-winning TV producer ('All in the Family')")
add("07-27", "Peggy Fleming", 1948, "Olympic gold medalist figure skater")
add("07-27", "Alex Rodriguez", 1975, "3-time AL MVP & 14-time MLB All-Star (696 HRs)")

add("07-28", "Beatrix Potter", 1866, "Children's author & illustrator ('The Tale of Peter Rabbit')")
add("07-28", "Karl Popper", 1902, "Philosopher of science ('The Logic of Scientific Discovery')")
add("07-28", "Jacqueline Kennedy Onassis", 1929, "First Lady, cultural icon & book editor")
add("07-28", "Bill Bradley", 1943, "NBA champion, Hall of Famer & U.S. Senator")
add("07-28", "Harry Kane", 1993, "England national football captain & top scorer")

add("07-29", "Alexis de Tocqueville", 1805, "French political scientist & author ('Democracy in America')")
add("07-29", "Booth Tarkington", 1869, "2-time Pulitzer Prize-winning novelist")
add("07-29", "Peter Jennings", 1938, "Longtime ABC World News Tonight anchor")
add("07-29", "Geddy Lee", 1953, "Rush lead vocalist, bassist & keyboardist")
add("07-29", "Fernando Alonso", 1981, "2-time Formula One World Champion")

add("07-30", "Emily Brontë", 1818, "English novelist & poet ('Wuthering Heights')")
add("07-30", "Henry Ford", 1863, "Automotive industrialist & assembly-line pioneer")
add("07-30", "Buddy Guy", 1936, "8-time Grammy-winning Chicago blues guitar legend")
add("07-30", "Arnold Schwarzenegger", 1947, "7-time Mr. Olympia, blockbuster actor & California Governor")
add("07-30", "Christopher Nolan", 1970, "Academy Award-winning director ('Oppenheimer', 'Inception')")

add("07-31", "Milton Friedman", 1912, "Nobel laureate economist & free-market champion")
add("07-31", "Curt Gowdy", 1919, "Legendary sports broadcaster ('The American Sportsman')")
add("07-31", "Wesley Snipes", 1962, "Action star & actor ('Blade', 'White Men Can\'t Jump')")
add("07-31", "J.K. Rowling", 1965, "Author of the 'Harry Potter' fantasy series")
add("07-31", "Mark Cuban", 1958, "Entrepreneur, investor & Dallas Mavericks owner")

# ==================== AUGUST ====================
add("08-01", "Herman Melville", 1819, "Author of 'Moby-Dick'")
add("08-01", "Jerry Garcia", 1942, "Grateful Dead frontman, lead guitarist & songwriter")
add("08-01", "Coolio", 1963, "Grammy-winning rapper ('Gangsta\'s Paradise')")
add("08-01", "Bastian Schweinsteiger", 1984, "World Cup champion & Chicago Fire midfielder")

add("08-02", "Frédéric Auguste Bartholdi", 1834, "French sculptor who designed the Statue of Liberty")
add("08-02", "James Baldwin", 1924, "Author, essayist & civil rights voice ('The Fire Next Time')")
add("08-02", "Peter O'Toole", 1932, "Legendary 8-time Oscar-nominated actor ('Lawrence of Arabia')")
add("08-02", "Mary-Louise Parker", 1964, "Tony & Emmy-winning actor ('Weeds', 'Angels in America')")

add("08-03", "P.D. James", 1920, "English crime fiction author (Adam Dalgliesh mysteries)")
add("08-03", "Tony Bennett", 1926, "20-time Grammy-winning vocal legend ('I Left My Heart in San Francisco')")
add("08-03", "Martin Sheen", 1940, "Emmy-winning actor ('Apocalypse Now', 'The West Wing')")
add("08-03", "Martha Stewart", 1941, "Lifestyle mogul, television personality & author")
add("08-03", "Tom Brady", 1977, "7-time Super Bowl champion & 5-time Super Bowl MVP quarterback")

add("08-04", "Percy Bysshe Shelley", 1792, "English Romantic poet ('Ozymandias')")
add("08-04", "Louis Armstrong", 1901, "Foundational jazz trumpeter & singer ('What a Wonderful World')")
add("08-04", "Barack Obama", 1961, "44th U.S. President & Nobel Peace laureate")
add("08-04", "Jeff Gordon", 1971, "4-time NASCAR Cup Series champion & Hall of Famer")

add("08-05", "Guy de Maupassant", 1850, "French master of the short story")
add("08-05", "John Huston", 1906, "Oscar-winning director ('The Maltese Falcon', 'The African Queen')")
add("08-05", "Neil Armstrong", 1930, "Apollo 11 commander & first human to walk on the Moon")
add("08-05", "Patrick Ewing", 1962, "NBA Hall of Fame center & 11-time All-Star")

add("08-06", "Alfred, Lord Tennyson", 1809, "Poet Laureate of Great Britain ('The Charge of the Light Brigade')")
add("08-06", "Alexander Fleming", 1881, "Nobel laureate physician who discovered penicillin")
add("08-06", "Lucille Ball", 1911, "4-time Emmy-winning comedy pioneer ('I Love Lucy') & studio head")
add("08-06", "Andy Warhol", 1928, "Pop art visionary (Campbell's Soup Cans, Marilyn prints)")
add("08-06", "David Robinson", 1965, "2-time NBA champion, MVP & Hall of Fame center ('The Admiral')")

add("08-07", "Mata Hari", 1876, "Exotic dancer & WWI spy")
add("08-07", "Garrison Keillor", 1942, "Author & host of 'A Prairie Home Companion'")
add("08-07", "David Crosby", 1941, "2-time Rock and Roll Hall of Fame singer-songwriter")
add("08-07", "Charlize Theron", 1975, "Academy Award-winning actor ('Monster', 'Mad Max: Fury Road')")
add("08-07", "Mike Trout", 1991, "3-time AL MVP & 11-time MLB All-Star")

add("08-08", "Emiliano Zapata", 1879, "Leader of the Mexican Revolution")
add("08-08", "Dustin Hoffman", 1937, "2-time Academy Award-winning actor ('The Graduate', 'Rain Man')")
add("08-08", "Nigel Mansell", 1953, "Formula One & CART World Champion")
add("08-08", "The Edge", 1961, "U2 lead guitarist, keyboardist & songwriter")
add("08-08", "Roger Federer", 1981, "20-time Grand Slam tennis champion & 8-time Wimbledon winner")

add("08-09", "John Dryden", 1631, "First official Poet Laureate of England")
add("08-09", "P.L. Travers", 1899, "Author of 'Mary Poppins'")
add("08-09", "Sam Elliott", 1944, "Oscar-nominated actor ('The Big Lebowski', 'A Star Is Born')")
add("08-09", "Whitney Houston", 1963, "6-time Grammy-winning vocal superstar ('I Will Always Love You')")
add("08-09", "Deion Sanders", 1967, "NFL Hall of Famer, MLB player & coach ('Prime Time')")

add("08-10", "Henri Nestlé", 1814, "Food pioneer & founder of Nestlé")
add("08-10", "Leo Fender", 1909, "Inventor of the Telecaster and Stratocaster electric guitars")
add("08-10", "Ian Anderson", 1947, "Jethro Tull frontman, flutist & songwriter")
add("08-10", "Antonio Banderas", 1960, "Oscar-nominated actor ('The Mask of Zorro', 'Pain and Glory')")

add("08-11", "Enid Blyton", 1897, "Prolific English children's author ('The Famous Five')")
add("08-11", "Steve Wozniak", 1950, "Apple co-founder & inventor of Apple I and II computers")
add("08-11", "Hulk Hogan", 1953, "12-time world wrestling champion & pop culture icon")
add("08-11", "Viola Davis", 1965, "EGOT-winning actor ('Fences', 'How to Get Away with Murder')")

add("08-12", "Robert Mills", 1781, "Architect of the Washington Monument")
add("08-12", "Cecil B. DeMille", 1881, "Pioneering film director ('The Ten Commandments')")
add("08-12", "Mark Knopfler", 1949, "Dire Straits lead guitarist & singer-songwriter ('Sultans of Swing')")
add("08-12", "Pete Sampras", 1971, "14-time Grand Slam tennis champion")

add("08-13", "William Caxton", 1422, "First person to introduce a printing press into England (approx)")
add("08-13", "Alfred Hitchcock", 1899, "The 'Master of Suspense' filmmaker ('Psycho', 'Rear Window', 'Vertigo')")
add("08-13", "Fidel Castro", 1926, "Cuban revolutionary & long-serving head of state")
add("08-13", "Dan Fogelberg", 1951, "Singer-songwriter ('Leader of the Band')")

add("08-14", "Doc Holliday", 1851, "Old West gambler, gunfighter & dentist (O.K. Corral)")
add("08-14", "Steve Martin", 1945, "5-time Grammy & Emmy-winning comedic legend, banjoist & writer")
add("08-14", "Earvin 'Magic' Johnson", 1959, "5-time NBA champion, 3-time MVP & Hall of Fame point guard")
add("08-14", "Halle Berry", 1966, "First Black woman to win Best Actress Oscar ('Monster\'s Ball')")

add("08-15", "Napoleon Bonaparte", 1769, "French military commander & Emperor of the French")
add("08-15", "Sir Walter Scott", 1771, "Scottish historical novelist & poet ('Ivanhoe')")
add("08-15", "Julia Child", 1912, "Chef, author & pioneer of television cooking ('The French Chef')")
add("08-15", "Oscar Peterson", 1925, "8-time Grammy-winning jazz piano virtuoso")
add("08-15", "Ben Affleck", 1972, "2-time Academy Award-winning filmmaker & actor ('Good Will Hunting', 'Argo')")

add("08-16", "T.E. Lawrence", 1888, "British officer & author ('Lawrence of Arabia')")
add("08-16", "Charles Bukowski", 1920, "Poet & novelist ('Post Office')")
add("08-16", "Frank Gifford", 1930, "NFL MVP, Hall of Famer & 'Monday Night Football' commentator")
add("08-16", "James Cameron", 1954, "3-time Oscar-winning director ('Titanic', 'Avatar', 'Terminator')")
add("08-16", "Madonna", 1958, "The 'Queen of Pop' & best-selling female recording artist")

add("08-17", "Davy Crockett", 1786, "Folk hero, frontiersman & Alamo defender ('King of the Wild Frontier')")
add("08-17", "Mae West", 1893, "Vaudeville star, screenwriter & comedic Hollywood actor")
add("08-17", "Robert De Niro", 1943, "2-time Academy Award-winning actor ('The Godfather Part II', 'Raging Bull')")
add("08-17", "Thierry Henry", 1977, "World Cup champion & Arsenal all-time record goalscorer")

add("08-18", "Meriwether Lewis", 1774, "Explorer & leader of the Lewis and Clark Expedition")
add("08-18", "Shelley Winters", 1920, "2-time Academy Award-winning actor ('The Diary of Anne Frank')")
add("08-18", "Robert Redford", 1936, "Oscar-winning director, actor & Sundance Film Festival founder")
add("08-18", "Patrick Swayze", 1952, "Actor & dancer ('Dirty Dancing', 'Ghost')")

add("08-19", "Orville Wright", 1871, "Aviation pioneer who made the first powered flight")
add("08-19", "Coco Chanel", 1883, "Pioneering French fashion designer & Chanel founder")
add("08-19", "Ogden Nash", 1902, "Humorous poet known for light verse")
add("08-19", "Bill Clinton", 1946, "42nd U.S. President")

add("08-20", "Benjamin Harrison", 1833, "23rd U.S. President")
add("08-20", "H.P. Lovecraft", 1890, "Master of cosmic horror fiction (Cthulhu Mythos)")
add("08-20", "Ron Paul", 1935, "Physician, author & longtime U.S. Congressman")
add("08-20", "Robert Plant", 1948, "Led Zeppelin lead singer & rock frontman")
add("08-20", "Amy Adams", 1974, "6-time Academy Award-nominated actor ('Arrival')")

add("08-21", "Count Basie", 1904, "9-time Grammy-winning jazz bandleader & pianist")
add("08-21", "Wilt Chamberlain", 1936, "NBA legend & Hall of Fame center (scored 100 points in single game)")
add("08-21", "Kenny Rogers", 1938, "3-time Grammy-winning country superstar ('The Gambler')")
add("08-21", "Usain Bolt", 1986, "8-time Olympic gold sprinter & world record holder (100m in 9.58s)")

add("08-22", "Claude Debussy", 1862, "French Impressionist composer ('Clair de Lune', 'La Mer')")
add("08-22", "Dorothy Parker", 1893, "Satirical poet, critic & Algonquin Round Table wit")
add("08-22", "Ray Bradbury", 1920, "Author ('Fahrenheit 451', 'The Martian Chronicles')")
add("08-22", "Carl Yastrzemski", 1939, "Hall of Fame Red Sox slugger & MLB Triple Crown winner")

add("08-23", "Louis XVI", 1754, "King of France during the French Revolution")
add("08-23", "Gene Kelly", 1912, "Legendary dancer, actor & director ('Singin\' in the Rain')")
add("08-23", "Rick Springfield", 1949, "Grammy-winning rocker ('Jessie\'s Girl') & actor")
add("08-23", "Kobe Bryant", 1978, "5-time NBA champion, MVP & global basketball icon")

add("08-24", "William Wilberforce", 1759, "Leader of the movement to abolish the slave trade")
add("08-24", "Cal Ripken Jr.", 1960, "Baseball Hall of Famer ('The Iron Man', 2,632 consecutive games)")
add("08-24", "Reggie Miller", 1965, "NBA Hall of Famer & all-time clutch 3-point marksman")
add("08-24", "Dave Chappelle", 1973, "5-time Emmy & Mark Twain Prize-winning comedic genius")

add("08-25", "Allan Pinkerton", 1819, "Detective & founder of the Pinkerton National Detective Agency")
add("08-25", "Leonard Bernstein", 1918, "Conductor, composer ('West Side Story') & educator")
add("08-25", "Sean Connery", 1930, "Academy Award-winning Scottish actor & original James Bond")
add("08-25", "Gene Simmons", 1949, "KISS bassist, co-founder & entrepreneur")
add("08-25", "Tim Burton", 1958, "Gothic fantasy filmmaker ('Edward Scissorhands', 'Beetlejuice')")

add("08-26", "Antoine Lavoisier", 1743, "Father of modern chemistry")
add("08-26", "Mother Teresa", 1910, "Nobel Peace Prize laureate & saint")
add("08-26", "Katherine Johnson", 1918, "NASA mathematician whose orbital calculations aided Apollo 11")
add("08-26", "Macaulay Culkin", 1980, "Actor ('Home Alone')")

add("08-27", "Georg Wilhelm Friedrich Hegel", 1770, "German idealist philosopher")
add("08-27", "Charles Stewart Rolls", 1877, "Motoring and aviation pioneer & Rolls-Royce co-founder")
add("08-27", "Lyndon B. Johnson", 1908, "36th U.S. President (Civil Rights Act & Great Society)")
add("08-27", "Paul Reubens", 1952, "Actor & comedian ('Pee-wee Herman')")

add("08-28", "Johann Wolfgang von Goethe", 1749, "German literary giant ('Faust')")
add("08-28", "Donald O'Connor", 1925, "Dancer & actor ('Singin\' in the Rain')")
add("08-28", "Lou Piniella", 1943, "MLB manager of the year (led 2007-08 Cubs)")
add("08-28", "David Fincher", 1962, "Oscar-nominated director ('Fight Club', 'The Social Network')")
add("08-28", "Jack Black", 1969, "Actor, comedian & Tenacious D frontman ('School of Rock')")

add("08-29", "John Locke", 1632, "Enlightenment philosopher ('Father of Liberalism')")
add("08-29", "Oliver Wendell Holmes Sr.", 1809, "Physician, poet & author")
add("08-29", "Ingrid Bergman", 1915, "3-time Academy Award-winning screen legend ('Casablanca', 'Gaslight')")
add("08-29", "Charlie Parker", 1920, "Pioneering bebop jazz saxophonist & composer ('Bird')")
add("08-29", "Michael Jackson", 1958, "The 'King of Pop' & 13-time Grammy winner ('Thriller')")

add("08-30", "Mary Shelley", 1797, "Author of 'Frankenstein; or, The Modern Prometheus'")
add("08-30", "Ernest Rutherford", 1871, "Nobel laureate physicist ('Father of Nuclear Physics')")
add("08-30", "Ted Williams", 1918, "Hall of Fame Red Sox slugger & last MLB player to hit .400 (.406 in 1941)")
add("08-30", "Warren Buffett", 1930, "Chairman of Berkshire Hathaway & legendary investor")
add("08-30", "Cameron Diaz", 1972, "Actor ('There\'s Something About Mary', 'Shrek')")

add("08-31", "Arthur Conan Doyle", 1859, "Sherlock Holmes author (traditional note; May 22 is primary)")
add("08-31", "Maria Montessori", 1870, "Physician, educator & founder of the Montessori method")
add("08-31", "William Saroyan", 1908, "Pulitzer & Oscar-winning novelist and playwright")
add("08-31", "Richard Gere", 1949, "Golden Globe-winning actor ('Pretty Woman', 'Chicago')")
add("08-31", "Edwin Moses", 1955, "2-time Olympic gold hurdler (122 consecutive race wins)")

print("July and August loaded.")

# ==================== SEPTEMBER ====================
add("09-01", "Rocky Marciano", 1923, "Undefeated World Heavyweight boxing champion (49-0)")
add("09-01", "Barry Gibb", 1946, "Bee Gees singer-songwriter & disco icon ('Stayin\' Alive')")
add("09-01", "Gloria Estefan", 1957, "3-time Grammy-winning Latin pop superstar (Miami Sound Machine)")
add("09-01", "Zendaya", 1996, "2-time Emmy-winning actor ('Euphoria', 'Dune', 'Spider-Man')")

add("09-02", "Queen Liliʻuokalani", 1838, "Last sovereign monarch of the Kingdom of Hawaii")
add("09-02", "Terry Bradshaw", 1948, "4-time Super Bowl champion quarterback & broadcaster")
add("09-02", "Jimmy Connors", 1952, "8-time Grand Slam tennis champion & 109 ATP titles")
add("09-02", "Keanu Reeves", 1964, "Hollywood action icon ('The Matrix', 'John Wick', 'Speed')")
add("09-02", "Salma Hayek", 1966, "Academy Award-nominated Mexican actor & producer ('Frida')")

add("09-03", "Ferdinand Porsche", 1875, "Automotive engineer & founder of the Porsche company")
add("09-03", "Al Jardine", 1942, "The Beach Boys guitarist & co-founder")
add("09-03", "Charlie Sheen", 1965, "Golden Globe-winning actor ('Platoon', 'Wall Street')")
add("09-03", "Shaun White", 1986, "3-time Olympic gold medalist snowboarder")

add("09-04", "Anton Bruckner", 1824, "Austrian Romantic composer & organist")
add("09-04", "Mike Piazza", 1968, "Hall of Fame catcher (MLB record 396 HRs as catcher)")
add("09-04", "Wes Bentley", 1978, "Actor ('American Beauty', 'Yellowstone')")
add("09-04", "Beyoncé", 1981, "32-time Grammy-winning global cultural icon ('Renaissance')")

add("09-05", "Jesse James", 1847, "American Old West outlaw & folk legend")
add("09-05", "John Cage", 1912, "Avant-garde composer ('4\'33\"') & musical philosopher")
add("09-05", "Bob Newhart", 1929, "Grammy & Emmy-winning comedic genius & Chicago native ('The Bob Newhart Show')")
add("09-05", "Freddie Mercury", 1946, "Queen frontman, vocal phenomenon & rock icon ('Bohemian Rhapsody')")
add("09-05", "Michael Keaton", 1951, "Oscar-nominated actor ('Batman', 'Birdman', 'Beetlejuice')")

add("09-06", "Marquis de Lafayette", 1757, "French military hero of the American Revolution")
add("09-06", "Jane Addams", 1860, "Chicago social reformer, Hull House founder & 1st American woman Nobel Peace laureate")
add("09-06", "Roger Waters", 1943, "Pink Floyd co-founder, bassist & principal songwriter ('The Wall')")
add("09-06", "Idris Elba", 1972, "Golden Globe-winning British actor & producer ('Luther', 'The Wire')")
add("09-06", "John Wall", 1990, "5-time NBA All-Star point guard")

add("09-07", "Queen Elizabeth I", 1533, "Tudor monarch who oversaw England's Golden Age")
add("09-07", "Sonny Rollins", 1930, "Grammy-winning jazz tenor saxophone titan ('Saxophone Colossus')")
add("09-07", "Buddy Holly", 1936, "Rock and roll pioneer & songwriter ('Peggy Sue', 'That\'ll Be the Day')")
add("09-07", "Chrissie Hynde", 1951, "The Pretenders frontwoman & rock singer-songwriter")
add("09-07", "Kevin Love", 1988, "NBA champion & 5-time All-Star power forward")

add("09-08", "Antonín Dvořák", 1841, "Czech Romantic composer ('New World Symphony')")
add("09-08", "Peter Sellers", 1925, "Comic actor ('The Pink Panther', 'Dr. Strangelove')")
add("09-08", "Bernie Sanders", 1941, "Long-serving U.S. Senator from Vermont")
add("09-08", "Pink", 1979, "3-time Grammy-winning pop rock singer & performer")
add("09-08", "Avicii", 1989, "Grammy-nominated Swedish electronic music producer & DJ ('Wake Me Up')")

add("09-09", "Colonel Harland Sanders", 1890, "Founder of Kentucky Fried Chicken (KFC)")
add("09-09", "Otis Redding", 1941, "Soul singer-songwriter ('(Sittin\' On) The Dock of the Bay')")
add("09-09", "Hugh Grant", 1960, "Golden Globe-winning actor ('Four Weddings and a Funeral', 'Notting Hill')")
add("09-09", "Adam Sandler", 1966, "Actor, comedian & Mark Twain Prize recipient ('Happy Gilmore', 'Uncut Gems')")
add("09-09", "Michael Bublé", 1975, "5-time Grammy-winning Canadian jazz & pop singer")
add("09-09", "Michelle Williams", 1980, "5-time Academy Award-nominated actor ('Brokeback Mountain', 'The Fabelmans')")

add("09-10", "Arnold Palmer", 1929, "Golf icon & 7-time major champion ('The King')")
add("09-10", "Roger Maris", 1934, "2-time AL MVP who hit 61 home runs in 1961 for the Yankees")
add("09-10", "Karl Lagerfeld", 1933, "Visionary fashion designer & Chanel creative director")
add("09-10", "Colin Firth", 1960, "Academy Award-winning actor ('The King\'s Speech')")
add("09-10", "Guy Ritchie", 1968, "British film director ('Snatch', 'Sherlock Holmes')")
add("09-10", "Misty Copeland", 1982, "First African American female principal dancer at ABT")

add("09-11", "O. Henry", 1862, "Master short story writer ('The Gift of the Magi')")
add("09-11", "Bear Bryant", 1913, "Legendary Alabama football coach (6 national titles)")
add("09-11", "Brian De Palma", 1940, "Film director ('Scarface', 'The Untouchables', 'Carrie')")
add("09-11", "Harry Connick Jr.", 1967, "3-time Grammy & 2-time Emmy-winning singer & pianist")
add("09-11", "Taraji P. Henson", 1970, "Oscar-nominated & Golden Globe-winning actor ('Hidden Figures', 'Empire')")
add("09-11", "Ludacris", 1977, "3-time Grammy-winning rapper & actor ('Fast & Furious')")

add("09-12", "Jesse Owens", 1913, "4-time Olympic gold track & field hero at 1936 Berlin Games")
add("09-12", "Barry White", 1944, "2-time Grammy-winning deep-voiced soul icon ('Can\'t Get Enough of Your Love')")
add("09-12", "Neil Peart", 1952, "Rush drummer & lyricist, widely regarded as a rock percussion master")
add("09-12", "Hans Zimmer", 1957, "2-time Oscar-winning film composer ('The Lion King', 'Dune', 'Gladiator')")
add("09-12", "Jennifer Hudson", 1981, "EGOT-winning Chicago singer & actor ('Dreamgirls')")

add("09-13", "Clara Schumann", 1819, "German Romantic pianist & composer")
add("09-13", "Roald Dahl", 1916, "Beloved author ('Charlie and the Chocolate Factory', 'Matilda')")
add("09-13", "Bill Monroe", 1911, "The 'Father of Bluegrass Music' & mandolinist")
add("09-13", "Michael Johnson", 1967, "4-time Olympic gold sprinter & world record holder")
add("09-13", "Fiona Apple", 1977, "3-time Grammy-winning singer-songwriter ('Criminal')")

add("09-14", "Alexander von Humboldt", 1769, "Prussian polymath, geographer & naturalist")
add("09-14", "Ivan Pavlov", 1849, "Nobel laureate physiologist (conditioned reflex)")
add("09-14", "Sam Neill", 1947, "Actor ('Jurassic Park', 'Peaky Blinders')")
add("09-14", "Amy Winehouse", 1983, "5-time Grammy-winning British vocal phenomenon ('Back to Black')")

add("09-15", "James Fenimore Cooper", 1789, "Author ('The Last of the Mohicans')")
add("09-15", "Agatha Christie", 1890, "Best-selling novelist of all time (Hercule Poirot, Miss Marple)")
add("09-15", "Tommy Lee Jones", 1946, "Academy Award-winning actor ('The Fugitive', 'Men in Black')")
add("09-15", "Oliver Stone", 1946, "3-time Oscar-winning director ('Platoon', 'Born on the Fourth of July')")
add("09-15", "Dan Marino", 1961, "NFL MVP & Hall of Fame Dolphins quarterback (61,361 pass yards)")
add("09-15", "Prince Harry", 1984, "Duke of Sussex & Invictus Games founder")

add("09-16", "Lauren Bacall", 1924, "Academy Honorary Award-winning Hollywood screen legend ('To Have and Have Not')")
add("09-16", "B.B. King", 1925, "15-time Grammy-winning 'King of the Blues' & guitarist ('The Thrill Is Gone')")
add("09-16", "David Copperfield", 1956, "21-time Emmy-winning illusionist")
add("09-16", "Amy Poehler", 1971, "Emmy-winning comedic actor, writer & producer ('Parks and Recreation')")

add("09-17", "Hank Williams", 1923, "Country music songwriting pioneer ('Hey, Good Lookin\'', 'Your Cheatin\' Heart')")
add("09-17", "John Ritter", 1948, "Emmy & Golden Globe-winning comedy star ('Three\'s Company')")
add("09-17", "Phil Jackson", 1945, "11-time NBA champion head coach (Bulls & Lakers)")
add("09-17", "Baz Luhrmann", 1962, "Oscar-nominated director ('Moulin Rouge!', 'The Great Gatsby')")
add("09-17", "Patrick Mahomes", 1995, "3-time Super Bowl champion & 2-time NFL MVP quarterback")

add("09-18", "Samuel Johnson", 1709, "English writer & creator of 'A Dictionary of the English Language'")
add("09-18", "Greta Garbo", 1905, "Academy Honorary Award-winning Hollywood screen legend ('Grand Hotel')")
add("09-18", "Frankie Avalon", 1940, "Singer & actor ('Venus', 'Grease')")
add("09-18", "Ronaldo Nazário", 1976, "2-time Ballon d'Or winner & Brazilian World Cup legend ('R9')")

add("09-19", "William Golding", 1911, "Nobel laureate author ('Lord of the Flies')")
add("09-19", "Adam West", 1928, "Actor who starred in TV's original 1960s 'Batman'")
add("09-19", "Jeremy Irons", 1948, "Academy, Emmy & Tony-winning English actor ('Reversal of Fortune')")
add("09-19", "Jimmy Fallon", 1974, "Emmy-winning host of 'The Tonight Show' & comedian")

add("09-20", "Upton Sinclair", 1878, "Pulitzer Prize-winning author & social reformer ('The Jungle')")
add("09-20", "Sophia Loren", 1934, "Academy Award-winning Italian screen icon ('Two Women')")
add("09-20", "George R.R. Martin", 1948, "Author of 'A Song of Ice and Fire' ('Game of Thrones')")
add("09-20", "Guy Lafleur", 1951, "5-time Stanley Cup champion & Hockey Hall of Famer")

add("09-21", "H.G. Wells", 1866, "Pioneering sci-fi author ('The War of the Worlds', 'The Time Machine')")
add("09-21", "Chuck Jones", 1912, "Legendary animator (Bugs Bunny, Daffy Duck, Road Runner)")
add("09-21", "Stephen King", 1947, "Master of horror & best-selling author ('The Shining', 'It', 'Carrie')")
add("09-21", "Bill Murray", 1950, "Emmy-winning Chicago comedy & film legend ('Ghostbusters', 'Groundhog Day')")
add("09-21", "Faith Hill", 1967, "5-time Grammy-winning country music superstar")

add("09-22", "Michael Faraday", 1791, "Physicist & chemist (electromagnetism & electromagnetic induction)")
add("09-22", "Tommy Lasorda", 1927, "Hall of Fame Dodgers manager (2 World Series titles)")
add("09-22", "Joan Jett", 1958, "Rock and roll icon & frontwoman ('I Love Rock \'n\' Roll')")
add("09-22", "Andrea Bocelli", 1958, "World-renowned Italian operatic tenor & crossover classical artist")
add("09-22", "Thiago Silva", 1984, "Brazilian football star & Champions League winner")

add("09-23", "Euripides", -480, "Tragic playwright of ancient Athens ('Medea') (trad.)")
add("09-23", "John Coltrane", 1926, "Jazz saxophonist & musical innovator ('A Love Supreme')")
add("09-23", "Ray Charles", 1930, "17-time Grammy-winning pioneer of soul music ('Georgia on My Mind')")
add("09-23", "Bruce Springsteen", 1949, "20-time Grammy & Oscar-winning rock icon ('The Boss')")
add("09-23", "Anthony Mackie", 1978, "Actor ('Captain America', 'The Hurt Locker')")

add("09-24", "F. Scott Fitzgerald", 1896, "Jazz Age author ('The Great Gatsby', 'Tender Is the Night')")
add("09-24", "Jim Henson", 1936, "Puppeteer & visionary creator of The Muppets ('Sesame Street')")
add("09-24", "Joe Greene", 1946, "4-time Super Bowl champion & NFL Hall of Fame DT ('Mean Joe')")
add("09-24", "Nia Vardalos", 1962, "Oscar-nominated screenwriter & actor ('My Big Fat Greek Wedding')")

add("09-25", "William Faulkner", 1897, "Nobel laureate author ('The Sound and the Fury')")
add("09-25", "Mark Hamill", 1951, "Actor ('Luke Skywalker' in 'Star Wars') & voice of the Joker")
add("09-25", "Scottie Pippen", 1965, "6-time Chicago Bulls NBA champion & Hall of Famer")
add("09-25", "Will Smith", 1968, "Academy Award & 4-time Grammy-winning actor & rapper")
add("09-25", "Catherine Zeta-Jones", 1969, "Academy Award-winning Welsh actor ('Chicago')")

add("09-26", "T.S. Eliot", 1888, "Nobel laureate poet & critic ('The Waste Land', 'The Love Song of J. Alfred Prufrock')")
add("09-26", "George Gershwin", 1898, "Composer ('Rhapsody in Blue', 'An American in Paris', 'Porgy and Bess')")
add("09-26", "Olivia Newton-John", 1948, "4-time Grammy-winning singer & actor ('Grease', 'Physical')")
add("09-26", "Serena Williams", 1981, "23-time Grand Slam singles champion & tennis legend")

add("09-27", "Samuel Adams", 1722, "Founding Father, political philosopher & Sons of Liberty organizer")
add("09-27", "Meat Loaf", 1947, "Grammy-winning rock singer & actor ('Bat Out of Hell')")
add("09-27", "Steve Kerr", 1965, "9-time NBA champion (5 as player with Bulls/Spurs, 4 as Warriors coach)")
add("09-27", "Gwyneth Paltrow", 1972, "Academy Award-winning actor ('Shakespeare in Love')")
add("09-27", "Lil Wayne", 1982, "5-time Grammy-winning hip-hop artist & record executive")

add("09-28", "Confucius", -551, "Ancient Chinese philosopher & founder of Confucianism")
add("09-28", "Ed Sullivan", 1901, "Television host whose variety show introduced The Beatles to the U.S.")
add("09-28", "Brigitte Bardot", 1934, "French screen star, singer & animal rights activist")
add("09-28", "Mika Häkkinen", 1968, "2-time Formula One World Champion ('The Flying Finn')")
add("09-28", "Naomi Watts", 1968, "2-time Oscar-nominated actor ('Mulholland Drive')")

add("09-29", "Miguel de Cervantes", 1547, "Spanish author ('Don Quixote') (trad. baptism Sept 29)")
add("09-29", "Enrico Fermi", 1901, "Nobel laureate physicist who created 1st nuclear reactor at Univ. of Chicago")
add("09-29", "Gene Autry", 1907, "Singing cowboy actor & only person with 5 stars on Hollywood Walk of Fame")
add("09-29", "Jerry Lee Lewis", 1935, "Rock and roll pioneer & pianist ('Great Balls of Fire')")
add("09-29", "Kevin Durant", 1988, "2-time NBA champion, 2-time Finals MVP & 4-time Olympic gold medalist")

add("09-30", "Lord Raglan", 1788, "British field marshal (raglan sleeve namesake)")
add("09-30", "Truman Capote", 1924, "Author ('In Cold Blood', 'Breakfast at Tiffany\'s')")
add("09-30", "Elie Wiesel", 1928, "Holocaust survivor, Nobel Peace laureate & author ('Night')")
add("09-30", "Johnny Mathis", 1935, "Grammy Lifetime Achievement vocal icon ('Chances Are')")
add("09-30", "Martina Hingis", 1980, "5-time Grand Slam singles & 13-time doubles tennis champion")

# ==================== OCTOBER ====================
add("10-01", "Jimmy Carter", 1924, "39th U.S. President & Nobel Peace Prize laureate")
add("10-01", "Julie Andrews", 1935, "Academy Award & Grammy-winning star ('The Sound of Music', 'Mary Poppins')")
add("10-01", "Rod Carew", 1945, "7-time AL batting champion & Baseball Hall of Famer")
add("10-01", "George Weah", 1966, "Ballon d'Or-winning footballer & President of Liberia")
add("10-01", "Brie Larson", 1989, "Academy Award-winning actor ('Room', 'Captain Marvel')")

add("10-02", "Mahatma Gandhi", 1869, "Leader of the Indian independence movement & nonviolence pioneer")
add("10-02", "Wallace Stevens", 1879, "Pulitzer Prize-winning modernist poet")
add("10-02", "Groucho Marx", 1890, "Comedic icon, master of wit & Marx Brothers frontman")
add("10-02", "Sting", 1951, "17-time Grammy-winning singer-songwriter (The Police)")

add("10-03", "Thomas Wolfe", 1900, "Novelist ('Look Homeward, Angel')")
add("10-03", "Gore Vidal", 1925, "Novelist, essayist & political commentator")
add("10-03", "Chubby Checker", 1941, "Rock and roll singer ('The Twist')")
add("10-03", "Stevie Ray Vaughan", 1954, "Grammy-winning blues guitar virtuoso")
add("10-03", "Gwen Stefani", 1969, "3-time Grammy-winning singer-songwriter (No Doubt)")

add("10-04", "Rutherford B. Hayes", 1822, "19th U.S. President")
add("10-04", "Buster Keaton", 1895, "Pioneering silent film comedian & stunt master ('The General')")
add("10-04", "Charlton Heston", 1923, "Academy Award-winning actor ('Ben-Hur', 'The Ten Commandments')")
add("10-04", "Anne Rice", 1941, "Gothic fiction author ('Interview with the Vampire')")
add("10-04", "Liev Schreiber", 1967, "Tony-winning actor & narrator ('Ray Donovan')")

add("10-05", "Chester A. Arthur", 1829, "21st U.S. President")
add("10-05", "Ray Kroc", 1902, "Businessman who built McDonald's into a global franchise")
add("10-05", "Brian Johnson", 1947, "AC/DC lead vocalist ('Back in Black')")
add("10-05", "Mario Lemieux", 1965, "3-time NHL MVP, 2-time Stanley Cup champion & Hall of Famer")
add("10-05", "Kate Winslet", 1975, "Academy Award-winning English actor ('Titanic', 'The Reader')")

add("10-06", "George Westinghouse", 1846, "Inventor of the railway air brake & AC electrical pioneer")
add("10-06", "Le Corbusier", 1887, "Swiss-French pioneer of modern architecture")
add("10-06", "Thor Heyerdahl", 1914, "Norwegian adventurer & ethnographer (Kon-Tiki expedition)")
add("10-06", "Tony Dungy", 1955, "Super Bowl-winning NFL head coach & Hall of Famer")
add("10-06", "Elisabeth Shue", 1963, "Oscar-nominated actor ('Leaving Las Vegas', 'The Karate Kid')")

add("10-07", "Niels Bohr", 1885, "Nobel laureate physicist (Bohr model of the atom)")
add("10-07", "Desmond Tutu", 1931, "Archbishop, anti-apartheid leader & Nobel Peace laureate")
add("10-07", "Yo-Yo Ma", 1955, "19-time Grammy-winning world-renowned cellist")
add("10-07", "Simon Cowell", 1959, "Music executive & television personality ('American Idol')")
add("10-07", "Vladimir Putin", 1952, "President of Russia")

add("10-08", "Heinrich Schliemann", 1822, "Archaeologist who excavated Troy and Mycenae")
add("10-08", "Juan Perón", 1895, "President of Argentina & political movement founder")
add("10-08", "Chevy Chase", 1943, "3-time Emmy-winning comedic actor ('Caddyshack', 'SNL')")
add("10-08", "Sigourney Weaver", 1949, "3-time Oscar-nominated actor ('Alien', 'Avatar', 'Ghostbusters')")
add("10-08", "Bruno Mars", 1985, "15-time Grammy-winning pop superstar & songwriter")

add("10-09", "Camille Saint-Saëns", 1835, "French Romantic composer ('The Carnival of the Animals')")
add("10-09", "John Lennon", 1940, "The Beatles co-founder, singer-songwriter & peace icon ('Imagine')")
add("10-09", "John Entwistle", 1944, "The Who legendary bassist ('The Ox')")
add("10-09", "Guillermo del Toro", 1964, "3-time Oscar-winning filmmaker ('The Shape of Water', 'Pan\'s Labyrinth')")

add("10-10", "Giuseppe Verdi", 1813, "Master Italian opera composer ('Rigoletto', 'La Traviata', 'Aida')")
add("10-10", "Fridtjof Nansen", 1861, "Norwegian explorer, scientist & Nobel Peace laureate")
add("10-10", "Thelonious Monk", 1917, "Jazz pianist & composer ('Round Midnight')")
add("10-10", "Harold Pinter", 1930, "Nobel laureate British playwright ('The Birthday Party')")
add("10-10", "Dale Earnhardt Jr.", 1974, "2-time Daytona 500 champion & NASCAR Hall of Famer")

add("10-11", "Eleanor Roosevelt", 1884, "First Lady, diplomat & drafter of Universal Declaration of Human Rights")
add("10-11", "Art Blakey", 1919, "Jazz drummer & bandleader of the Jazz Messengers")
add("10-11", "Daryl Hall", 1946, "Hall & Oates co-founder & lead vocalist ('Rich Girl')")
add("10-11", "Steve Young", 1961, "NFL MVP, Super Bowl XXIX MVP quarterback & Hall of Famer")

add("10-12", "Ralph Vaughan Williams", 1872, "English composer ('The Lark Ascending')")
add("10-12", "Luciano Pavarotti", 1935, "Operatic tenor & global vocal icon ('The Three Tenors')")
add("10-12", "Hugh Jackman", 1968, "Tony & Emmy-winning actor ('Wolverine', 'The Greatest Showman')")
add("10-12", "Bode Miller", 1977, "Olympic gold medalist alpine ski racer")

add("10-13", "Rudolf Virchow", 1821, "Physician & 'Father of Modern Pathology'")
add("10-13", "Paul Simon", 1941, "16-time Grammy-winning singer-songwriter ('Bridge Over Troubled Water', 'Graceland')")
add("10-13", "Sammy Hagar", 1947, "Van Halen frontman & rock singer ('I Can\'t Drive 55')")
add("10-13", "Jerry Rice", 1962, "3-time Super Bowl champion & NFL all-time touchdown leader (208 TDs)")
add("10-13", "Sacha Baron Cohen", 1971, "Oscar-nominated comedic actor & satirist ('Borat')")

add("10-14", "William Penn", 1644, "Founder of the Province of Pennsylvania & Quaker leader")
add("10-14", "Dwight D. Eisenhower", 1890, "34th U.S. President & Supreme Allied Commander in WWII")
add("10-14", "e.e. cummings", 1894, "Innovative American poet & playwright")
add("10-14", "Roger Moore", 1927, "English actor (played James Bond in 7 films)")
add("10-14", "Usher", 1978, "8-time Grammy-winning R&B superstar & entertainer")

add("10-15", "Virgil", -70, "Ancient Roman poet ('The Aeneid')")
add("10-15", "Friedrich Nietzsche", 1844, "German philosopher ('Thus Spoke Zarathustra')")
add("10-15", "Lee Iacocca", 1924, "Automotive executive (Ford Mustang, Chrysler turnaround)")
add("10-15", "Emeril Lagasse", 1959, "Celebrity chef, author & restaurateur ('Bam!')")

add("10-16", "Noah Webster", 1758, "Lexicographer ('An American Dictionary of the English Language')")
add("10-16", "Oscar Wilde", 1854, "Irish playwright, poet & wit ('The Picture of Dorian Gray', 'The Importance of Being Earnest')")
add("10-16", "David Ben-Gurion", 1886, "Primary founder & first Prime Minister of Israel")
add("10-16", "Paul Kariya", 1974, "Hockey Hall of Fame winger & Olympic gold medalist")
add("10-16", "Naomi Osaka", 1997, "4-time Grand Slam tennis champion")

add("10-17", "Evel Knievel", 1938, "Legendary daredevil motorcycle stunt performer")
add("10-17", "Mae Jemison", 1956, "First Black woman astronaut in space (aboard Endeavour)")
add("10-17", "Eminem", 1972, "15-time Grammy & Oscar-winning hip-hop icon ('Lose Yourself')")
add("10-17", "Ernie Els", 1969, "4-time golf Major champion ('The Big Easy')")

add("10-18", "Chuck Berry", 1926, "Pioneer of rock and roll ('Johnny B. Goode', 'Maybellene')")
add("10-18", "George C. Scott", 1927, "Academy Award-winning actor ('Patton', 'Dr. Strangelove')")
add("10-18", "Martina Navratilova", 1956, "18-time Grand Slam singles champion & 9-time Wimbledon winner")
add("10-18", "Jean-Claude Van Damme", 1960, "Martial arts champion & action movie star ('Bloodsport')")
add("10-18", "Zac Efron", 1987, "Actor ('High School Musical', 'The Greatest Showman')")

add("10-19", "John Adams", 1735, "2nd U.S. President & Founding Father (b. Oct 19 Old Style / Oct 30 New Style)")
add("10-19", "Subrahmanyan Chandrasekhar", 1910, "Nobel laureate astrophysicist (Chandrasekhar limit)")
add("10-19", "John Le Carré", 1931, "Master author of espionage fiction ('Tinker Tailor Soldier Spy')")
add("10-19", "Evander Holyfield", 1962, "Only 4-time World Heavyweight boxing champion ('The Real Deal')")

add("10-20", "Christopher Wren", 1632, "Architect who redesigned 52 London churches including St Paul's Cathedral")
add("10-20", "Arthur Rimbaud", 1854, "French Symbolist poet ('A Season in Hell')")
add("10-20", "Bela Lugosi", 1882, "Iconic horror actor (classic 'Dracula')")
add("10-20", "Mickey Mantle", 1931, "3-time AL MVP, 7-time World Series champion & Hall of Famer")
add("10-20", "Tom Petty", 1950, "3-time Grammy-winning rock legend & Heartbreakers frontman ('Free Fallin\'')")
add("10-20", "Snoop Dogg", 1971, "Hip-hop icon, entertainer & cultural ambassador")

add("10-21", "Samuel Taylor Coleridge", 1772, "English Romantic poet ('The Rime of the Ancient Mariner')")
add("10-21", "Alfred Nobel", 1833, "Chemist, inventor of dynamite & founder of Nobel Prizes")
add("10-21", "Dizzy Gillespie", 1917, "Pioneering bebop trumpet virtuoso & composer ('A Night in Tunisia')")
add("10-21", "Carrie Fisher", 1956, "Actor ('Princess Leia' in 'Star Wars') & author")
add("10-21", "Kim Kardashian", 1980, "Media personality, businesswoman & social justice advocate")

add("10-22", "Franz Liszt", 1811, "Hungarian virtuoso pianist & Romantic composer ('Hungarian Rhapsodies')")
add("10-22", "Sarah Bernhardt", 1844, "Legendary French stage and early film actor")
add("10-22", "Curley Howard", 1903, "The Three Stooges comedic star")
add("10-22", "Arsène Wenger", 1949, "Longtime Arsenal manager who led 'The Invincibles'")
add("10-22", "Ichiro Suzuki", 1973, "AL MVP, Rookie of the Year & single-season hits record holder (262 hits)")

add("10-23", "Pelé", 1940, "Only 3-time FIFA World Cup champion & football's 'King'")
add("10-23", "Michael Crichton", 1942, "Author & filmmaker ('Jurassic Park', 'ER')")
add("10-23", "Ang Lee", 1954, "2-time Academy Award-winning director ('Brokeback Mountain', 'Life of Pi')")
add("10-23", "Ryan Reynolds", 1976, "Actor & producer ('Deadpool')")

add("10-24", "Antonie van Leeuwenhoek", 1632, "Dutch microbiologist & 'Father of Microbiology'")
add("10-24", "Moss Hart", 1904, "Tony & Pulitzer-winning playwright and director ('You Can\'t Take It with You')")
add("10-24", "Bill Wyman", 1936, "The Rolling Stones bassist")
add("10-24", "Kevin Kline", 1947, "Academy Award & 3-time Tony-winning actor ('A Fish Called Wanda')")
add("10-24", "Drake", 1986, "5-time Grammy-winning hip-hop artist & global chart-topper")

add("10-25", "Georges Bizet", 1838, "French composer of the opera 'Carmen'")
add("10-25", "Pablo Picasso", 1881, "Spanish master painter & co-founder of Cubism ('Guernica')")
add("10-25", "Bobby Knight", 1940, "3-time NCAA championship basketball coach")
add("10-25", "Pedro Martínez", 1971, "3-time Cy Young Award winner & Baseball Hall of Famer")
add("10-25", "Katy Perry", 1984, "Pop superstar with 9 Billboard Hot 100 #1 hits")

add("10-26", "Domenico Scarlatti", 1685, "Italian Baroque composer of 555 keyboard sonatas")
add("10-26", "Mahalia Jackson", 1911, "The 'Queen of Gospel Music' & civil rights activist")
add("10-26", "Hillary Clinton", 1947, "First Lady, U.S. Senator & U.S. Secretary of State")
add("10-26", "Keith Urban", 1967, "4-time Grammy-winning country superstar & guitarist")

add("10-27", "James Cook", 1728, "British explorer & navigator of the Pacific")
add("10-27", "Theodore Roosevelt", 1858, "26th U.S. President, conservationist & Nobel Peace laureate")
add("10-27", "Sylvia Plath", 1932, "Poet & novelist ('The Bell Jar', 'Ariel')")
add("10-27", "John Cleese", 1939, "Comedic icon & Monty Python co-founder ('Fawlty Towers')")

add("10-28", "Desiderius Erasmus", 1466, "Dutch humanist scholar & theologian ('Praise of Folly')")
add("10-28", "Jonas Salk", 1914, "Virologist who developed the first effective polio vaccine")
add("10-28", "Bill Gates", 1955, "Microsoft co-founder & global philanthropist")
add("10-28", "Julia Roberts", 1967, "Academy Award-winning actor ('Erin Brockovich', 'Pretty Woman')")
add("10-28", "Joaquin Phoenix", 1974, "Academy Award-winning actor ('Joker', 'Gladiator')")

add("10-29", "James Boswell", 1740, "Scottish biographer ('The Life of Samuel Johnson')")
add("10-29", "Bob Ross", 1942, "Beloved painter & television host ('The Joy of Painting')")
add("10-29", "Richard Dreyfuss", 1947, "Academy Award-winning actor ('Jaws', 'The Goodbye Girl')")
add("10-29", "Winona Ryder", 1971, "Golden Globe-winning actor ('Stranger Things', 'Beetlejuice')")

add("10-30", "John Adams", 1735, "2nd U.S. President & Founding Father (New Style date)")
add("10-30", "Ezra Pound", 1885, "Modernist poet & critic")
add("10-30", "Diego Maradona", 1960, "World Cup champion & Argentine football legend")
add("10-30", "Devin Booker", 1996, "4-time NBA All-Star & Olympic gold medalist guard")

add("10-31", "Jan Vermeer", 1632, "Dutch Golden Age master painter ('Girl with a Pearl Earring')")
add("10-31", "John Keats", 1795, "English Romantic poet ('Ode to a Nightingale', 'Ode on a Grecian Urn')")
add("10-31", "Chiang Kai-shek", 1887, "Leader of the Republic of China")
add("10-31", "Dan Rather", 1931, "Longtime CBS Evening News anchor & journalist")
add("10-31", "Peter Jackson", 1961, "3-time Oscar-winning director ('The Lord of the Rings' trilogy)")

print("September and October loaded.")

# ==================== NOVEMBER ====================
add("11-01", "Stephen Crane", 1871, "Author & poet ('The Red Badge of Courage')")
add("11-01", "Gary Player", 1935, "9-time golf Major champion & Grand Slam winner")
add("11-01", "Lyle Lovett", 1957, "4-time Grammy-winning singer-songwriter & actor")
add("11-01", "Anthony Kiedis", 1962, "Red Hot Chili Peppers frontman & lyricist")

add("11-02", "Daniel Boone", 1734, "American pioneer, explorer & frontiersman")
add("11-02", "Marie Antoinette", 1755, "Last Queen of France before French Revolution")
add("11-02", "Warren G. Harding", 1865, "29th U.S. President")
add("11-02", "Burt Lancaster", 1913, "Academy Award-winning Hollywood leading man ('Elmer Gantry')")
add("11-02", "k.d. lang", 1961, "4-time Grammy-winning singer-songwriter ('Constant Craving')")

add("11-03", "Stephen F. Austin", 1793, "'Father of Texas' & founder of first Anglo-American colony")
add("11-03", "Charles Bronson", 1921, "Action movie tough guy ('Death Wish', 'The Magnificent Seven')")
add("11-03", "Bob Feller", 1918, "Hall of Fame Cleveland Indians pitcher ('Rapid Robert')")
add("11-03", "Gerd Müller", 1945, "World Cup champion & German football goalscoring legend ('Der Bomber')")
add("11-03", "Kendall Jenner", 1995, "Model & television personality")

add("11-04", "Will Rogers", 1879, "Vaudeville performer, humorist & social commentator")
add("11-04", "Walter Cronkite", 1916, "Legendary CBS news anchor ('The Most Trusted Man in America')")
add("11-04", "Art Carney", 1918, "Oscar & 6-time Emmy-winning actor ('The Honeymooners', 'Harry and Tonto')")
add("11-04", "Matthew McConaughey", 1969, "Academy Award-winning actor ('Dallas Buyers Club', 'Interstellar')")
add("11-04", "Sean Combs", 1969, "Hip-hop producer, rapper & music executive")

add("11-05", "Eugene V. Debs", 1855, "Labor union leader & 5-time Socialist presidential candidate")
add("11-05", "Will Durant", 1885, "Pulitzer-winning philosopher & historian ('The Story of Civilization')")
add("11-05", "Roy Rogers", 1911, "'King of the Cowboys' singing western star")
add("11-05", "Art Garfunkel", 1941, "Grammy-winning singer (Simon & Garfunkel) (Nov 5)")
add("11-05", "Bill Walton", 1952, "2-time NBA champion, MVP & Hall of Fame center/broadcaster")

add("11-06", "John Philip Sousa", 1854, "'The March King' composer & conductor ('The Stars and Stripes Forever')")
add("11-06", "James Naismith", 1861, "Canadian-American educator & inventor of basketball")
add("11-06", "Glenn Frey", 1948, "Eagles co-founder, singer & guitarist ('Hotel California')")
add("11-06", "Maria Shriver", 1955, "Peabody & Emmy-winning journalist & author")
add("11-06", "Emma Stone", 1988, "2-time Academy Award-winning actor ('La La Land', 'Poor Things')")

add("11-07", "James Cook", 1728, "British navigator & explorer (trad. Nov 7 Old Style)")
add("11-07", "Marie Curie", 1867, "Only person to win Nobel Prizes in two different sciences (Physics & Chemistry)")
add("11-07", "Albert Camus", 1913, "Nobel laureate French philosopher & author ('The Stranger')")
add("11-07", "Billy Graham", 1918, "Influential evangelist & spiritual adviser to U.S. presidents")
add("11-07", "Joni Mitchell", 1943, "10-time Grammy-winning folk-rock singer-songwriter ('Blue', 'Both Sides Now')")

add("11-08", "Edmond Halley", 1656, "Astronomer who calculated the orbit of Halley's Comet")
add("11-08", "Bram Stoker", 1847, "Irish author who created 'Dracula'")
add("11-08", "Margaret Mitchell", 1900, "Pulitzer Prize-winning author of 'Gone with the Wind'")
add("11-08", "Bonnie Raitt", 1949, "13-time Grammy-winning blues singer & guitarist")
add("11-08", "Gordon Ramsay", 1966, "Michelin-starred celebrity chef & restaurateur")

add("11-09", "Benjamin Banneker", 1731, "Almanac author, surveyor & astronomer")
add("11-09", "Carl Sagan", 1934, "Astronomer, astrophysicist & author ('Cosmos', 'Contact')")
add("11-09", "Bob Gibson", 1935, "2-time World Series MVP, 2-time Cy Young Award Hall of Famer (1.12 ERA in 1968)")
add("11-09", "Lou Ferrigno", 1951, "Bodybuilder & actor ('The Incredible Hulk')")

add("11-10", "Martin Luther", 1483, "German priest & seminal figure of the Protestant Reformation")
add("11-10", "Oliver Goldsmith", 1728, "Anglo-Irish novelist & poet ('The Vicar of Wakefield')")
add("11-10", "Ennio Morricone", 1928, "2-time Oscar-winning Italian film composer ('The Good, the Bad and the Ugly')")
add("11-10", "Neil Gaiman", 1960, "Author ('The Sandman', 'American Gods', 'Coraline')")
add("11-10", "Tracy Morgan", 1968, "Emmy-nominated comedic actor ('30 Rock', 'SNL')")

add("11-11", "Fyodor Dostoevsky", 1821, "Russian literary master ('Crime and Punishment', 'The Brothers Karamazov')")
add("11-11", "Pat George", 1927, "Jazz and classical pianist")
add("11-11", "Kurt Vonnegut", 1922, "Satirical novelist ('Slaughterhouse-Five', 'Cat\'s Cradle')")
add("11-11", "Demi Moore", 1962, "Actor & producer ('Ghost', 'A Few Good Men')")
add("11-11", "Leonardo DiCaprio", 1974, "Academy Award-winning actor & environmentalist ('Titanic', 'The Revenant')")

add("11-12", "Auguste Rodin", 1840, "French sculptor ('The Thinker', 'The Gates of Hell')")
add("11-12", "Grace Kelly", 1929, "Academy Award-winning Hollywood star & Princess of Monaco ('Rear Window')")
add("11-12", "Charles Manson", 1934, "Cult leader & criminal")
add("11-12", "Neil Young", 1945, "Rock and Roll Hall of Fame singer-songwriter & guitarist ('Heart of Gold')")
add("11-12", "Sammy Sosa", 1968, "NL MVP & Chicago Cubs slugger (609 career home runs)")
add("11-12", "Ryan Gosling", 1980, "3-time Oscar-nominated actor ('La La Land', 'Barbie', 'Drive')")

add("11-13", "Robert Louis Stevenson", 1850, "Scottish author ('Treasure Island', 'Strange Case of Dr Jekyll and Mr Hyde')")
add("11-13", "Louis Brandeis", 1856, "First Jewish U.S. Supreme Court Justice & privacy advocate")
add("11-13", "Whoopi Goldberg", 1955, "EGOT-winning actor, comedian & moderator ('The View', 'Ghost')")
add("11-13", "Jimmy Kimmel", 1967, "Emmy-winning late-night host & comedian")

add("11-14", "Robert Fulton", 1765, "Engineer who developed the first commercially successful steamboat")
add("11-14", "Claude Monet", 1840, "French painter & founder of Impressionism ('Water Lilies')")
add("11-14", "Aaron Copland", 1900, "Composer ('Appalachian Spring', 'Fanfare for the Common Man')")
add("11-14", "Prince Charles", 1948, "King Charles III of the United Kingdom")
add("11-14", "Condoleezza Rice", 1954, "66th U.S. Secretary of State & political scientist")

add("11-15", "William Herschel", 1738, "Astronomer & composer who discovered Uranus")
add("11-15", "Georgia O'Keeffe", 1887, "Modernist painter & 'Mother of American Modernism'")
add("11-15", "Erwin Rommel", 1891, "German field marshal ('The Desert Fox')")
add("11-15", "Randy Savage", 1952, "2-time WWF World Heavyweight champion ('Macho Man')")

add("11-16", "Tiberius", -42, "Second Roman Emperor")
add("11-16", "W.C. Handy", 1873, "'Father of the Blues' composer ('St. Louis Blues')")
add("11-16", "Burgess Meredith", 1907, "2-time Oscar-nominated actor ('Rocky', 'The Twilight Zone')")
add("11-16", "Shigeru Miyamoto", 1952, "Nintendo visionary & creator of Mario, Zelda, and Donkey Kong")
add("11-16", "Maggie Gyllenhaal", 1977, "Oscar-nominated actor & filmmaker ('The Lost Daughter')")

add("11-17", "August Mobius", 1790, "German mathematician & astronomer (Möbius strip)")
add("11-17", "Rock Hudson", 1925, "Hollywood leading man ('Pillow Talk', 'Giant')")
add("11-17", "Gordon Lightfoot", 1938, "Canadian folk legend ('The Wreck of the Edmund Fitzgerald')")
add("11-17", "Martin Scorsese", 1942, "Academy Award-winning director ('Taxi Driver', 'Goodfellas', 'Raging Bull')")
add("11-17", "Danny DeVito", 1944, "Emmy & Golden Globe-winning comedic actor ('Taxi', 'It\'s Always Sunny')")

add("11-18", "Louis Daguerre", 1787, "Inventor of the daguerreotype photographic process")
add("11-18", "George Gallup", 1901, "Pioneer of survey sampling techniques & Gallup poll founder")
add("11-18", "David Ortiz", 1975, "3-time World Series champion & Hall of Famer ('Big Papi', 541 HRs)")
add("11-18", "Owen Wilson", 1968, "Oscar-nominated screenwriter & actor ('Wedding Crashers', 'Bottle Rocket')")

add("11-19", "James A. Garfield", 1831, "20th U.S. President")
add("11-19", "Indira Gandhi", 1917, "First female Prime Minister of India")
add("11-19", "Larry King", 1933, "Emmy & Peabody-winning talk show broadcaster ('Larry King Live')")
add("11-19", "Ted Turner", 1938, "Media mogul, CNN founder & philanthropist")
add("11-19", "Jodie Foster", 1962, "2-time Best Actress Oscar winner ('The Silence of the Lambs', 'Taxi Driver')")

add("11-20", "Edwin Hubble", 1889, "Astronomer who proved the expanding universe (Hubble Telescope namesake)")
add("11-20", "Chester Gould", 1900, "Cartoonist & creator of the comic strip 'Dick Tracy'")
add("11-20", "Robert F. Kennedy", 1925, "U.S. Attorney General, U.S. Senator & civil rights leader")
add("11-20", "Joe Biden", 1942, "46th U.S. President")
add("11-20", "Duane Allman", 1946, "Virtuoso slide guitarist & The Allman Brothers Band co-founder")

add("11-21", "Voltaire", 1694, "French Enlightenment writer, historian & philosopher ('Candide')")
add("11-21", "Stan Musial", 1920, "3-time NL MVP & Cardinals Hall of Famer ('Stan the Man', 3,630 hits)")
add("11-21", "Harold Ramis", 1944, "Chicago comedy writer, director & actor ('Ghostbusters', 'Groundhog Day')")
add("11-21", "Goldie Hawn", 1945, "Academy Award-winning actor & producer ('Cactus Flower', 'Private Benjamin')")
add("11-21", "Ken Griffey Jr.", 1969, "Hall of Fame center fielder & 13-time All-Star ('The Kid', 630 HRs)")

add("11-22", "George Eliot", 1819, "Victorian novelist ('Middlemarch', 'Silas Marner')")
add("11-22", "Charles de Gaulle", 1890, "French general & President of the French Republic")
add("11-22", "Billie Jean King", 1943, "39-time Grand Slam tennis champion & pioneer for gender equality")
add("11-22", "Mark Ruffalo", 1967, "3-time Oscar-nominated actor & activist ('The Avengers', 'Spotlight')")
add("11-22", "Scarlett Johansson", 1984, "2-time Oscar-nominated actor ('Lost in Translation', 'Black Widow')")

add("11-23", "Franklin Pierce", 1804, "14th U.S. President")
add("11-23", "Billy the Kid", 1859, "Infamous Old West outlaw & gunfighter")
add("11-23", "Boris Karloff", 1887, "Actor famous for Frankenstein's monster & Grinch narrator")
add("11-23", "Miley Cyrus", 1992, "2-time Grammy-winning singer-songwriter ('Flowers')")

add("11-24", "Baruch Spinoza", 1632, "Dutch Enlightenment philosopher ('Ethics')")
add("11-24", "Zachary Taylor", 1784, "12th U.S. President & Mexican-American War hero")
add("11-24", "Scott Joplin", 1868, "'King of Ragtime' composer ('The Entertainer', 'Maple Leaf Rag')")
add("11-24", "Dale Carnegie", 1888, "Author ('How to Win Friends and Influence People')")

add("11-25", "Andrew Carnegie", 1835, "Industrialist, steel magnate & legendary philanthropist")
add("11-25", "Joe DiMaggio", 1914, "3-time AL MVP & Hall of Fame center fielder (56-game hitting streak)")
add("11-25", "Pope John XXIII", 1881, "Pope who convened the Second Vatican Council")
add("11-25", "Christina Applegate", 1971, "Emmy-winning actor ('Married... with Children', 'Dead to Me')")

add("11-26", "Sojourner Truth", 1797, "Abolitionist & women's rights activist ('Ain\'t I a Woman?') (approx)")
add("11-26", "Charles M. Schulz", 1922, "Cartoonist & creator of 'Peanuts' (Charlie Brown, Snoopy)")
add("11-26", "Tina Turner", 1939, "8-time Grammy-winning 'Queen of Rock \'n\' Roll' ('What\'s Love Got to Do with It')")
add("11-26", "DJ Khaled", 1975, "Grammy-winning DJ, music producer & record executive")

add("11-27", "Anders Celsius", 1701, "Swedish astronomer who invented the Celsius temperature scale")
add("11-27", "Jimi Hendrix", 1942, "Widely celebrated as the greatest electric guitarist in rock history")
add("11-27", "Bruce Lee", 1940, "Martial arts master, philosopher & cinema trailblazer ('Enter the Dragon')")
add("11-27", "Bill Nye", 1955, "Mechanical engineer & science communicator ('Bill Nye the Science Guy')")

add("11-28", "William Blake", 1757, "English Romantic poet, painter & printmaker ('The Tyger')")
add("11-28", "Alexander Blok", 1880, "Russian lyrical poet")
add("11-28", "Berry Gordy", 1929, "Founder of Motown Records & songwriter")
add("11-28", "Jon Stewart", 1962, "22-time Emmy-winning host, satirist & comedian ('The Daily Show')")

add("11-29", "Christian Doppler", 1803, "Austrian physicist who discovered the Doppler effect")
add("11-29", "Louisa May Alcott", 1832, "Novelist ('Little Women')")
add("11-29", "C.S. Lewis", 1898, "Author & scholar ('The Chronicles of Narnia', 'The Screwtape Letters')")
add("11-29", "Vin Scully", 1927, "Hall of Fame Dodgers broadcaster for 67 seasons")
add("11-29", "Mariano Rivera", 1969, "5-time World Series champion & 1st unanimous Hall of Fame inductee (652 saves)")

add("11-30", "Jonathan Swift", 1667, "Satirist & essayist ('Gulliver\'s Travels', 'A Modest Proposal')")
add("11-30", "Mark Twain", 1835, "Author & humorist ('The Adventures of Tom Sawyer', 'Huckleberry Finn')")
add("11-30", "Winston Churchill", 1874, "British Prime Minister who led the UK through WWII & Nobel laureate")
add("11-30", "Bo Jackson", 1962, "Heisman winner & only athlete named All-Star in both NFL and MLB")
add("11-30", "Ben Stiller", 1965, "Emmy-winning comedic actor & director ('Zoolander', 'Meet the Parents')")

# ==================== DECEMBER ====================
add("12-01", "Marie Tussaud", 1761, "French wax sculptor & founder of Madame Tussauds")
add("12-01", "Woody Allen", 1935, "4-time Oscar-winning filmmaker & writer ('Annie Hall', 'Midnight in Paris')")
add("12-01", "Richard Pryor", 1940, "Pioneering stand-up comedian & actor ('Silver Streak')")
add("12-01", "Bette Midler", 1945, "3-time Grammy, 3-time Emmy & 2-time Tony-winning superstar ('The Divine Miss M')")

add("12-02", "Georges Seurat", 1859, "French Post-Impressionist painter & pointillism pioneer ('A Sunday on La Grande Jatte')")
add("12-02", "Maria Callas", 1923, "American-born Greek soprano & opera legend ('La Divina')")
add("12-02", "Gianni Versace", 1946, "Italian luxury fashion designer & Versace founder")
add("12-02", "Britney Spears", 1981, "Grammy-winning 'Princess of Pop' ('...Baby One More Time')")
add("12-02", "Aaron Rodgers", 1983, "4-time NFL MVP & Super Bowl XLV champion quarterback")

add("12-03", "Gilbert Stuart", 1755, "Painter of the iconic George Washington portrait on the $1 bill")
add("12-03", "Joseph Conrad", 1857, "Polish-British novelist ('Heart of Darkness', 'Lord Jim')")
add("12-03", "Ozzy Osbourne", 1948, "Black Sabbath frontman & 'Prince of Darkness'")
add("12-03", "Amanda Seyfried", 1985, "Oscar-nominated & Emmy-winning actor ('Mamma Mia!', 'The Dropout')")

add("12-04", "Thomas Carlyle", 1795, "Scottish essayist, historian & philosopher")
add("12-04", "Lillian Russell", 1861, "American singer and actor")
add("12-04", "Jeff Bridges", 1949, "Academy Award-winning actor ('The Big Lebowski', 'Crazy Heart')")
add("12-04", "Jay-Z", 1969, "24-time Grammy-winning hip-hop titan, mogul & entrepreneur")

add("12-05", "Martin Van Buren", 1782, "8th U.S. President & first born as a U.S. citizen")
add("12-05", "Walt Disney", 1901, "Animation pioneer, film producer & founder of Disney theme parks (22 Oscars)")
add("12-05", "Werner Heisenberg", 1901, "Nobel laureate physicist (Heisenberg uncertainty principle)")
add("12-05", "Little Richard", 1932, "'Architect of Rock and Roll' singer & pianist ('Tutti Frutti')")

add("12-06", "King Henry VI", 1421, "King of England & founder of Eton College and King's College, Cambridge")
add("12-06", "Dave Brubeck", 1920, "Jazz pianist & composer ('Take Five')")
add("12-06", "Randy Rhoads", 1956, "Virtuoso heavy metal guitarist (Ozzy Osbourne, Quiet Riot)")
add("12-06", "Giannis Antetokounmpo", 1994, "2-time NBA MVP, Finals MVP & NBA champion ('The Greek Freak')")

add("12-07", "Willa Cather", 1873, "Pulitzer Prize-winning novelist ('My Ántonia', 'O Pioneers!')")
add("12-07", "Eli Wallach", 1915, "Tony & Emmy-winning character actor ('The Good, the Bad and the Ugly')")
add("12-07", "Ted Knight", 1923, "2-time Emmy-winning actor ('The Mary Tyler Moore Show', 'Caddyshack')")
add("12-07", "Tom Waits", 1949, "Grammy-winning gravel-voiced singer-songwriter & actor")
add("12-07", "Larry Bird", 1956, "3-time NBA champion, 3-time consecutive MVP & Hall of Famer ('Larry Legend')")

add("12-08", "Eli Whitney", 1765, "Inventor of the cotton gin & interchangeable parts pioneer")
add("12-08", "Diego Rivera", 1886, "Mexican muralist & social realist painter")
add("12-08", "Sammy Davis Jr.", 1925, "Legendary entertainer, singer, dancer & Rat Pack member")
add("12-08", "Jim Morrison", 1943, "The Doors frontman, poet & rock icon ('Light My Fire')")

add("12-09", "John Milton", 1608, "English epic poet ('Paradise Lost')")
add("12-09", "Kirk Douglas", 1916, "Hollywood leading man & producer ('Spartacus', 'Paths of Glory')")
add("12-09", "Dick Van Dyke", 1925, "5-time Emmy & Tony-winning entertainer ('Mary Poppins', 'The Dick Van Dyke Show')")
add("12-09", "Judi Dench", 1934, "Academy Award & 8-time Olivier-winning acting legend ('Shakespeare in Love')")

add("12-10", "Ada Lovelace", 1815, "Mathematician regarded as the world's first computer programmer")
add("12-10", "Emily Dickinson", 1830, "Pioneering American lyric poet")
add("12-10", "Melvil Dewey", 1851, "Librarian & inventor of the Dewey Decimal classification system")
add("12-10", "Kenneth Branagh", 1960, "Academy Award-winning director, actor & Shakespearean adapter ('Belfast')")

add("12-11", "Robert Koch", 1843, "Nobel laureate physician & founder of modern bacteriology (TB, cholera)")
add("12-11", "Hector Berlioz", 1803, "French Romantic composer ('Symphonie fantastique')")
add("12-11", "Alexander Solzhenitsyn", 1918, "Nobel laureate Russian author ('The Gulag Archipelago')")
add("12-11", "Rita Moreno", 1931, "EGOT-winning performer ('West Side Story')")

add("12-12", "John Jay", 1745, "Founding Father & first Chief Justice of the U.S. Supreme Court")
add("12-12", "Gustave Flaubert", 1821, "French novelist ('Madame Bovary')")
add("12-12", "Edvard Munch", 1863, "Norwegian Expressionist painter ('The Scream')")
add("12-12", "Frank Sinatra", 1915, "Oscar & 11-time Grammy-winning vocal giant ('Ol\' Blue Eyes')")
add("12-12", "Bob Barker", 1923, "19-time Emmy-winning host of 'The Price Is Right' for 35 years")

add("12-13", "Heinrich Heine", 1797, "German lyric poet & journalist")
add("12-13", "Dick Van Dyke", 1925, "Emmy-winning actor & comedic dancer (trad. alt Dec 9/13)")
add("12-13", "Christopher Plummer", 1929, "Academy, 2-time Emmy & 2-time Tony-winning actor ('The Sound of Music')")
add("12-13", "Taylor Swift", 1989, "14-time Grammy-winning singer-songwriter & global phenomenon ('Eras Tour')")

add("12-14", "Nostradamus", 1503, "French astrologer & apothecary of prophecies")
add("12-14", "Ty Cobb", 1886, "Baseball Hall of Famer & all-time MLB batting average leader (.366)")
add("12-14", "Shirley Jackson", 1916, "Horror and mystery author ('The Lottery', 'The Haunting of Hill House')")
add("12-14", "Stan Smith", 1946, "2-time Grand Slam champion & iconic tennis shoe namesake")

add("12-15", "Nero", 37, "Fifth Roman Emperor")
add("12-15", "Alexandre Gustave Eiffel", 1832, "French civil engineer (Eiffel Tower, Statue of Liberty armature)")
add("12-15", "J. Paul Getty", 1892, "Oil industrialist & art collector (Getty Museum founder)")
add("12-15", "Don Johnson", 1949, "Golden Globe-winning actor ('Miami Vice', 'Knives Out')")

add("12-16", "Ludwig van Beethoven", 1770, "Titan of Western classical music (Symphonies No. 5 & 9) (baptized Dec 17)")
add("12-16", "Jane Austen", 1775, "Beloved English novelist ('Pride and Prejudice', 'Emma')")
add("12-16", "Arthur C. Clarke", 1917, "Sci-fi author & futurist ('2001: A Space Odyssey')")
add("12-16", "Krysten Ritter", 1981, "Actor ('Jessica Jones', 'Breaking Bad')")

add("12-17", "Paracelsus", 1493, "Swiss physician & 'Father of Toxicology'")
add("12-17", "John Greenleaf Whittier", 1807, "Abolitionist poet & Atlantic Monthly co-founder ('Snow-Bound')")
add("12-17", "Arthur Fiedler", 1894, "Longtime conductor of the Boston Pops Orchestra")
add("12-17", "Pope Francis", 1936, "Head of the Catholic Church & first Jesuit/Latin American pope")
add("12-17", "Manny Pacquiao", 1978, "Only 8-division world boxing champion in history")

add("12-18", "Charles Wesley", 1707, "Hymn writer ('Hark! The Herald Angels Sing') & Methodist co-founder")
add("12-18", "Archduke Franz Ferdinand", 1863, "Austrian heir whose 1914 assassination sparked WWI")
add("12-18", "Keith Richards", 1943, "The Rolling Stones legendary guitarist & songwriter")
add("12-18", "Steven Spielberg", 1946, "3-time Oscar-winning director ('Jaws', 'E.T.', 'Schindler\'s List', 'Jurassic Park')")
add("12-18", "Brad Pitt", 1963, "2-time Academy Award-winning actor & producer ('Fight Club', 'Once Upon a Time in Hollywood')")

add("12-19", "Philip Freneau", 1752, "'Poet of the American Revolution'")
add("12-19", "Albert A. Michelson", 1852, "First American Nobel laureate in science (speed of light measurements)")
add("12-19", "Édith Piaf", 1915, "France's national chanteuse ('La Vie en rose', 'Non, je ne regrette rien')")
add("12-19", "Jake Gyllenhaal", 1980, "Oscar-nominated actor ('Brokeback Mountain', 'Nightcrawler')")

add("12-20", "Harvey Firestone", 1868, "Founder of the Firestone Tire and Rubber Company")
add("12-20", "Branch Rickey", 1881, "Baseball executive who signed Jackie Robinson to break the color barrier")
add("12-20", "Irene Dunne", 1898, "5-time Oscar-nominated Hollywood actor")
add("12-20", "Kylian Mbappé", 1998, "World Cup champion & Real Madrid / France football superstar")

add("12-21", "Benjamin Disraeli", 1804, "2-time British Prime Minister & novelist")
add("12-21", "Joseph Stalin", 1878, "Premier of the Soviet Union through WWII (trad. Dec 21 / Dec 18 OS)")
add("12-21", "Frank Zappa", 1940, "Composer, rock innovator & Mothers of Invention frontman")
add("12-21", "Samuel L. Jackson", 1948, "Highest-grossing actor in film history & Oscar honoree ('Pulp Fiction')")
add("12-21", "Chris Evert", 1954, "18-time Grand Slam singles tennis champion")

add("12-22", "Jean Racine", 1639, "French master dramatist of French classicism ('Phèdre')")
add("12-22", "Giacomo Puccini", 1858, "Italian opera master ('La Bohème', 'Tosca', 'Madama Butterfly')")
add("12-22", "Lady Bird Johnson", 1912, "First Lady & environmental beautification champion")
add("12-22", "Robin Gibb", 1949, "Bee Gees singer-songwriter & co-founder")
add("12-22", "Ralph Fiennes", 1962, "2-time Oscar-nominated English actor (Voldemort, 'Schindler\'s List')")

add("12-23", "Richard Arkwright", 1732, "Inventor of the water frame spinning machine & factory system father")
add("12-23", "Connie Mack", 1862, "5-time World Series champion manager (holds MLB win record with 3,731)")
add("12-23", "Eddie Vedder", 1964, "Pearl Jam lead vocalist & grunge pioneer ('Alive', 'Black')")
add("12-23", "Jim Harbaugh", 1963, "National championship college coach & NFL head coach")

add("12-24", "Christopher 'Kit' Carson", 1809, "Frontiersman, mountain man & guide")
add("12-24", "Howard Hughes", 1905, "Aviator, aerospace engineer, filmmaker & industrialist")
add("12-24", "Ava Gardner", 1922, "Oscar-nominated Hollywood screen star ('Mogambo')")
add("12-24", "Anthony Fauci", 1940, "Immunologist & director of NIAID for 38 years")
add("12-24", "Ryan Seacrest", 1974, "Emmy-winning broadcaster & host ('American Idol')")

add("12-25", "Sir Isaac Newton", 1642, "Mathematician & physicist (laws of motion & universal gravitation) (OS)")
add("12-25", "Clara Barton", 1821, "Nurse & founder of the American Red Cross")
add("12-25", "Humphrey Bogart", 1899, "Academy Award-winning Hollywood screen legend ('Casablanca', 'The Maltese Falcon')")
add("12-25", "Cab Calloway", 1907, "Jazz singer & bandleader ('Minnie the Moocher')")
add("12-25", "Jimmy Buffett", 1946, "Singer-songwriter & entrepreneur ('Margaritaville')")

add("12-26", "Charles Babbage", 1791, "Mathematician & mechanical engineer ('Father of the Computer')")
add("12-26", "Mao Zedong", 1893, "Founding father of the People's Republic of China")
add("12-26", "Richard Widmark", 1914, "Oscar-nominated actor ('Kiss of Death')")
add("12-26", "Ozzie Smith", 1954, "13-time Gold Glove shortstop & Baseball Hall of Famer ('The Wizard')")

add("12-27", "Johannes Kepler", 1571, "Astronomer who discovered the laws of planetary motion")
add("12-27", "Louis Pasteur", 1822, "Microbiologist who developed pasteurization & rabies vaccine")
add("12-27", "Marlene Dietrich", 1901, "German-American singer & Hollywood screen legend ('The Blue Angel')")
add("12-27", "Cokie Roberts", 1943, "Emmy-winning NPR & ABC News journalist")

add("12-28", "Woodrow Wilson", 1856, "28th U.S. President & Nobel Peace Prize laureate (League of Nations)")
add("12-28", "Stan Lee", 1922, "Marvel Comics creative leader & co-creator of Spider-Man, Avengers, X-Men")
add("12-28", "Denzel Washington", 1954, "2-time Academy Award-winning acting giant ('Training Day', 'Glory')")
add("12-28", "John Legend", 1978, "EGOT-winning singer-songwriter & pianist ('All of Me')")

add("12-29", "Charles Goodyear", 1800, "Chemist who invented the vulcanization of rubber")
add("12-29", "Andrew Johnson", 1808, "17th U.S. President")
add("12-29", "Pablo Casals", 1876, "Catalan cellist, composer & conductor")
add("12-29", "Mary Tyler Moore", 1936, "7-time Emmy-winning television trailblazer ('The Mary Tyler Moore Show')")
add("12-29", "Ted Danson", 1947, "2-time Emmy-winning actor ('Cheers', 'The Good Place')")

add("12-30", "Rudyard Kipling", 1865, "Nobel laureate author & poet ('The Jungle Book', 'If—')")
add("12-30", "Bo Diddley", 1928, "Rock and roll pioneer & distinctive beat creator")
add("12-30", "Sandy Koufax", 1935, "3-time Cy Young Award winner & Dodgers Hall of Fame left-hander")
add("12-30", "Patti Smith", 1946, "The 'Punk Poet Laureate' singer-songwriter ('Horses')")
add("12-30", "Tiger Woods", 1975, "15-time golf Major champion & 82 PGA Tour titles")
add("12-30", "LeBron James", 1984, "4-time NBA champion, 4-time MVP & all-time NBA scoring leader")

add("12-31", "Jacques Cartier", 1491, "French explorer who claimed Canada for France")
add("12-31", "Henri Matisse", 1869, "French master painter & draftsperson of Modern Art")
add("12-31", "George C. Marshall", 1880, "5-star General, U.S. Secretary of State & Nobel Peace laureate (Marshall Plan)")
add("12-31", "John Denver", 1943, "Grammy-winning folk singer-songwriter ('Take Me Home, Country Roads')")
add("12-31", "Donna Summer", 1948, "5-time Grammy-winning 'Queen of Disco' ('Hot Stuff')")
add("12-31", "Anthony Hopkins", 1937, "2-time Academy Award-winning Welsh actor ('The Silence of the Lambs', 'The Father')")

print("All months loaded. Validating...")

# Verify all days of year
month_days = [
    (1, 31), (2, 29), (3, 31), (4, 30),
    (5, 31), (6, 30), (7, 31), (8, 31),
    (9, 30), (10, 31), (11, 30), (12, 31)
]

total_days = 0
missing = []
for m, max_d in month_days:
    m_str = f"{m:02d}"
    for d in range(1, max_d + 1):
        total_days += 1
        d_str = f"{d:02d}"
        key = f"{m_str}-{d_str}"
        if m_str not in months_data or key not in months_data[m_str]:
            missing.append(key)

print(f"Total days required: {total_days}")
print(f"Missing days: {len(missing)} {missing}")

if len(missing) == 0:
    print("SUCCESS: 100% of days (366 days) are covered!")

month_names = {
    "01": "january",
    "02": "february",
    "03": "march",
    "04": "april",
    "05": "may",
    "06": "june",
    "07": "july",
    "08": "august",
    "09": "september",
    "10": "october",
    "11": "november",
    "12": "december"
}

out_dir = "src/data/birthdays"
os.makedirs(out_dir, exist_ok=True)

for m_code, m_name in month_names.items():
    entries = months_data[m_code]
    file_path = os.path.join(out_dir, f"{m_name}.ts")
    with open(file_path, "w") as f:
        f.write("import type { BirthdayItem } from '../types';\n\n")
        f.write(f"export const {m_name}Birthdays: Record<string, BirthdayItem[]> = {{\n")
        for date_key in sorted(entries.keys()):
            f.write(f"  '{date_key}': [\n")
            for b in entries[date_key]:
                f.write(f"    {{ name: {json.dumps(b['name'])}, year: {b['year']}, note: {json.dumps(b['note'])} }},\n")
            f.write("  ],\n")
        f.write("};\n")
    print(f"Wrote {file_path}")

# Write index.ts
index_path = os.path.join(out_dir, "index.ts")
with open(index_path, "w") as f:
    f.write("import type { BirthdayItem } from '../types';\n")
    f.write("import { dateKey } from '../dayIndex';\n\n")
    for m_code, m_name in month_names.items():
        f.write(f"import {{ {m_name}Birthdays }} from './{m_name}';\n")
    f.write("\n")
    f.write("export const allBirthdays: Record<string, BirthdayItem[]> = {\n")
    for m_code, m_name in month_names.items():
        f.write(f"  ...{m_name}Birthdays,\n")
    f.write("};\n\n")
    f.write("export const fallbackBirthdays: BirthdayItem[] = [\n")
    f.write("  { name: 'Albert Einstein', year: 1879, note: 'Theoretical physicist' },\n")
    f.write("  { name: 'Marie Curie', year: 1867, note: 'Physicist & chemist' },\n")
    f.write("  { name: 'Leonardo da Vinci', year: 1452, note: 'Polymath & painter' },\n")
    f.write("  { name: 'Wolfgang Amadeus Mozart', year: 1756, note: 'Composer' },\n")
    f.write("];\n\n")
    f.write("/**\n")
    f.write(" * Get celebrity and historical birthdays for a given date.\n")
    f.write(" * Accepts Date object, 'YYYY-MM-DD', or 'MM-DD'.\n")
    f.write(" */\n")
    f.write("export function getBirthdaysForDate(date: Date | string = new Date()): BirthdayItem[] {\n")
    f.write("  let key: string;\n")
    f.write("  if (typeof date === 'string') {\n")
    f.write("    if (date.length === 5 && date.includes('-')) {\n")
    f.write("      key = date;\n")
    f.write("    } else {\n")
    f.write("      const parts = date.split('-');\n")
    f.write("      if (parts.length >= 3) {\n")
    f.write("        key = `${parts[1].padStart(2, '0')}-${parts[2].slice(0, 2).padStart(2, '0')}`;\n")
    f.write("      } else {\n")
    f.write("        key = dateKey(new Date(date));\n")
    f.write("      }\n")
    f.write("    }\n")
    f.write("  } else {\n")
    f.write("    key = dateKey(date);\n")
    f.write("  }\n")
    f.write("  return allBirthdays[key] || fallbackBirthdays;\n")
    f.write("}\n")

print("Generated src/data/birthdays/index.ts")
