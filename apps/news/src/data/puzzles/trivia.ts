/**
 * Static trivia bank — 100 entries, indexed by dayOfYear (1–100) and dateKey (MM-DD).
 * Lookup: pickByDate() in ../dayIndex.ts
 * Maintenance: Mike refreshes/extends this bank manually every ~3 months.
 * 
 */
import type { TriviaEntry } from '../types';

export const triviaBank: TriviaEntry[] = [
  {
    "dayOfYear": 1,
    "dateKey": "01-01",
    "question": "Which MLB team plays at Wrigley Field?",
    "answer": "Chicago Cubs",
    "category": "Baseball"
  },
  {
    "dayOfYear": 2,
    "dateKey": "01-02",
    "question": "What is the nickname of the Chicago Bears defense of 1985?",
    "answer": "The Monsters of the Midway",
    "category": "Football"
  },
  {
    "dayOfYear": 3,
    "dateKey": "01-03",
    "question": "Which NHL team is based in Chicago?",
    "answer": "Chicago Blackhawks",
    "category": "Hockey"
  },
  {
    "dayOfYear": 4,
    "dateKey": "01-04",
    "question": "Michael Jordan wore what number for most of his Bulls career?",
    "answer": "23",
    "category": "Basketball"
  },
  {
    "dayOfYear": 5,
    "dateKey": "01-05",
    "question": "Soldier Field is home to which NFL team?",
    "answer": "Chicago Bears",
    "category": "Football"
  },
  {
    "dayOfYear": 6,
    "dateKey": "01-06",
    "question": "The White Sox play in which South Side ballpark?",
    "answer": "Guaranteed Rate Field (formerly Comiskey)",
    "category": "Baseball"
  },
  {
    "dayOfYear": 7,
    "dateKey": "01-07",
    "question": "How many championships did the Bulls win in the 1990s?",
    "answer": "Six",
    "category": "Basketball"
  },
  {
    "dayOfYear": 8,
    "dateKey": "01-08",
    "question": "Who is known as \"Mr. Cub\"?",
    "answer": "Ernie Banks",
    "category": "Baseball"
  },
  {
    "dayOfYear": 9,
    "dateKey": "01-09",
    "question": "United Center hosts the Bulls and which other team?",
    "answer": "Blackhawks",
    "category": "Multi"
  },
  {
    "dayOfYear": 10,
    "dateKey": "01-10",
    "question": "What lake borders Chicago?",
    "answer": "Lake Michigan",
    "category": "Geography"
  },
  {
    "dayOfYear": 11,
    "dateKey": "01-11",
    "question": "In what year did the Cubs end their World Series drought?",
    "answer": "2016",
    "category": "Baseball"
  },
  {
    "dayOfYear": 12,
    "dateKey": "01-12",
    "question": "Walter Payton's nickname was?",
    "answer": "Sweetness",
    "category": "Football"
  },
  {
    "dayOfYear": 13,
    "dateKey": "01-13",
    "question": "Which coach led the Bulls dynasty with Phil Jackson?",
    "answer": "Phil Jackson",
    "category": "Basketball"
  },
  {
    "dayOfYear": 14,
    "dateKey": "01-14",
    "question": "The Super Bowl shuffle was recorded by which team?",
    "answer": "1985 Chicago Bears",
    "category": "Football"
  },
  {
    "dayOfYear": 15,
    "dateKey": "01-15",
    "question": "Wrigley Field opened in what decade?",
    "answer": "1910s (1914)",
    "category": "Baseball"
  },
  {
    "dayOfYear": 16,
    "dateKey": "01-16",
    "question": "Who hit the \"Bartman\" foul ball series?",
    "answer": "Steve Bartman incident, 2003 NLCS",
    "category": "Baseball"
  },
  {
    "dayOfYear": 17,
    "dateKey": "01-17",
    "question": "Chicago Marathon typically falls in which month?",
    "answer": "October",
    "category": "Running"
  },
  {
    "dayOfYear": 18,
    "dateKey": "01-18",
    "question": "What sport is played at Northwestern's Welsh-Ryan Arena?",
    "answer": "Basketball (and volleyball)",
    "category": "College"
  },
  {
    "dayOfYear": 19,
    "dateKey": "01-19",
    "question": "The Blackhawks' home jersey features which animal?",
    "answer": "Native American-inspired hawk logo",
    "category": "Hockey"
  },
  {
    "dayOfYear": 20,
    "dateKey": "01-20",
    "question": "Ditka coached which NFL franchise?",
    "answer": "Chicago Bears",
    "category": "Football"
  },
  {
    "dayOfYear": 21,
    "dateKey": "01-21",
    "question": "How many bases are on a baseball diamond?",
    "answer": "Four",
    "category": "Baseball"
  },
  {
    "dayOfYear": 22,
    "dateKey": "01-22",
    "question": "A football field is how many yards long (goal to goal)?",
    "answer": "100 yards",
    "category": "Football"
  },
  {
    "dayOfYear": 23,
    "dateKey": "01-23",
    "question": "How many players on the court for one NBA team?",
    "answer": "Five",
    "category": "Basketball"
  },
  {
    "dayOfYear": 24,
    "dateKey": "01-24",
    "question": "Hockey uses a puck made primarily of what?",
    "answer": "Vulcanized rubber",
    "category": "Hockey"
  },
  {
    "dayOfYear": 25,
    "dateKey": "01-25",
    "question": "What does RBI stand for?",
    "answer": "Runs Batted In",
    "category": "Baseball"
  },
  {
    "dayOfYear": 26,
    "dateKey": "01-26",
    "question": "What is a hat trick in hockey?",
    "answer": "Three goals by one player in a game",
    "category": "Hockey"
  },
  {
    "dayOfYear": 27,
    "dateKey": "01-27",
    "question": "March Madness refers to which sport?",
    "answer": "College basketball",
    "category": "Basketball"
  },
  {
    "dayOfYear": 28,
    "dateKey": "01-28",
    "question": "The Heisman Trophy is awarded in which sport?",
    "answer": "College football",
    "category": "Football"
  },
  {
    "dayOfYear": 29,
    "dateKey": "01-29",
    "question": "What is the distance of a regulation marathon?",
    "answer": "26.2 miles",
    "category": "Running"
  },
  {
    "dayOfYear": 30,
    "dateKey": "01-30",
    "question": "Olympic swimming pools are how many meters long?",
    "answer": "50 meters",
    "category": "Swimming"
  },
  {
    "dayOfYear": 31,
    "dateKey": "01-31",
    "question": "In tennis, what comes after deuce if a player scores?",
    "answer": "Advantage",
    "category": "Tennis"
  },
  {
    "dayOfYear": 32,
    "dateKey": "02-01",
    "question": "How many holes in a standard golf round?",
    "answer": "18",
    "category": "Golf"
  },
  {
    "dayOfYear": 33,
    "dateKey": "02-02",
    "question": "What color flag ends a NASCAR race?",
    "answer": "Checkered",
    "category": "Auto"
  },
  {
    "dayOfYear": 34,
    "dateKey": "02-03",
    "question": "FIFA World Cup is contested in which sport?",
    "answer": "Soccer (football)",
    "category": "Soccer"
  },
  {
    "dayOfYear": 35,
    "dateKey": "02-04",
    "question": "A strikeout is recorded how in a scorebook often?",
    "answer": "K",
    "category": "Baseball"
  },
  {
    "dayOfYear": 36,
    "dateKey": "02-05",
    "question": "Who holds the NBA career scoring record (as of mid-2020s)?",
    "answer": "LeBron James",
    "category": "Basketball"
  },
  {
    "dayOfYear": 37,
    "dateKey": "02-06",
    "question": "Green Bay Packers are rivals of which Chicago team?",
    "answer": "Chicago Bears",
    "category": "Football"
  },
  {
    "dayOfYear": 38,
    "dateKey": "02-07",
    "question": "What is the oldest continuously operating MLB park?",
    "answer": "Fenway or Wrigley (Wrigley 1914, Fenway 1912)",
    "category": "Baseball"
  },
  {
    "dayOfYear": 39,
    "dateKey": "02-08",
    "question": "Northwestern University is in which Illinois city?",
    "answer": "Evanston",
    "category": "Local"
  },
  {
    "dayOfYear": 40,
    "dateKey": "02-09",
    "question": "The Chicago Fire play which sport?",
    "answer": "MLS soccer",
    "category": "Soccer"
  },
  {
    "dayOfYear": 41,
    "dateKey": "02-10",
    "question": "What river was famously reversed in Chicago?",
    "answer": "Chicago River",
    "category": "Local"
  },
  {
    "dayOfYear": 42,
    "dateKey": "02-11",
    "question": "Soldier Field sits near which museum campus landmark?",
    "answer": "Field Museum / Adler / Shedd area",
    "category": "Local"
  },
  {
    "dayOfYear": 43,
    "dateKey": "02-12",
    "question": "Who was known as \"The Fridge\" for the Bears?",
    "answer": "William Perry",
    "category": "Football"
  },
  {
    "dayOfYear": 44,
    "dateKey": "02-13",
    "question": "Scottie Pippen was Jordan's teammate on which team?",
    "answer": "Chicago Bulls",
    "category": "Basketball"
  },
  {
    "dayOfYear": 45,
    "dateKey": "02-14",
    "question": "What is icing in hockey?",
    "answer": "Shooting the puck from behind center across the opposing goal line",
    "category": "Hockey"
  },
  {
    "dayOfYear": 46,
    "dateKey": "02-15",
    "question": "A perfect game in baseball means?",
    "answer": "No opposing batter reaches base",
    "category": "Baseball"
  },
  {
    "dayOfYear": 47,
    "dateKey": "02-16",
    "question": "How many points is a free throw worth?",
    "answer": "One",
    "category": "Basketball"
  },
  {
    "dayOfYear": 48,
    "dateKey": "02-17",
    "question": "What is the NFL championship game called?",
    "answer": "Super Bowl",
    "category": "Football"
  },
  {
    "dayOfYear": 49,
    "dateKey": "02-18",
    "question": "Stanley Cup belongs to which league?",
    "answer": "NHL",
    "category": "Hockey"
  },
  {
    "dayOfYear": 50,
    "dateKey": "02-19",
    "question": "World Series belongs to which league?",
    "answer": "MLB",
    "category": "Baseball"
  },
  {
    "dayOfYear": 51,
    "dateKey": "02-20",
    "question": "Which MLB team plays at Wrigley Field? (edition 2)",
    "answer": "Chicago Cubs",
    "category": "Baseball"
  },
  {
    "dayOfYear": 52,
    "dateKey": "02-21",
    "question": "What is the nickname of the Chicago Bears defense of 1985? (edition 2)",
    "answer": "The Monsters of the Midway",
    "category": "Football"
  },
  {
    "dayOfYear": 53,
    "dateKey": "02-22",
    "question": "Which NHL team is based in Chicago? (edition 2)",
    "answer": "Chicago Blackhawks",
    "category": "Hockey"
  },
  {
    "dayOfYear": 54,
    "dateKey": "02-23",
    "question": "Michael Jordan wore what number for most of his Bulls career? (edition 2)",
    "answer": "23",
    "category": "Basketball"
  },
  {
    "dayOfYear": 55,
    "dateKey": "02-24",
    "question": "Soldier Field is home to which NFL team? (edition 2)",
    "answer": "Chicago Bears",
    "category": "Football"
  },
  {
    "dayOfYear": 56,
    "dateKey": "02-25",
    "question": "The White Sox play in which South Side ballpark? (edition 2)",
    "answer": "Guaranteed Rate Field (formerly Comiskey)",
    "category": "Baseball"
  },
  {
    "dayOfYear": 57,
    "dateKey": "02-26",
    "question": "How many championships did the Bulls win in the 1990s? (edition 2)",
    "answer": "Six",
    "category": "Basketball"
  },
  {
    "dayOfYear": 58,
    "dateKey": "02-27",
    "question": "Who is known as \"Mr. Cub\"? (edition 2)",
    "answer": "Ernie Banks",
    "category": "Baseball"
  },
  {
    "dayOfYear": 59,
    "dateKey": "02-28",
    "question": "United Center hosts the Bulls and which other team? (edition 2)",
    "answer": "Blackhawks",
    "category": "Multi"
  },
  {
    "dayOfYear": 60,
    "dateKey": "03-01",
    "question": "What lake borders Chicago? (edition 2)",
    "answer": "Lake Michigan",
    "category": "Geography"
  },
  {
    "dayOfYear": 61,
    "dateKey": "03-02",
    "question": "In what year did the Cubs end their World Series drought? (edition 2)",
    "answer": "2016",
    "category": "Baseball"
  },
  {
    "dayOfYear": 62,
    "dateKey": "03-03",
    "question": "Walter Payton's nickname was? (edition 2)",
    "answer": "Sweetness",
    "category": "Football"
  },
  {
    "dayOfYear": 63,
    "dateKey": "03-04",
    "question": "Which coach led the Bulls dynasty with Phil Jackson? (edition 2)",
    "answer": "Phil Jackson",
    "category": "Basketball"
  },
  {
    "dayOfYear": 64,
    "dateKey": "03-05",
    "question": "The Super Bowl shuffle was recorded by which team? (edition 2)",
    "answer": "1985 Chicago Bears",
    "category": "Football"
  },
  {
    "dayOfYear": 65,
    "dateKey": "03-06",
    "question": "Wrigley Field opened in what decade? (edition 2)",
    "answer": "1910s (1914)",
    "category": "Baseball"
  },
  {
    "dayOfYear": 66,
    "dateKey": "03-07",
    "question": "Who hit the \"Bartman\" foul ball series? (edition 2)",
    "answer": "Steve Bartman incident, 2003 NLCS",
    "category": "Baseball"
  },
  {
    "dayOfYear": 67,
    "dateKey": "03-08",
    "question": "Chicago Marathon typically falls in which month? (edition 2)",
    "answer": "October",
    "category": "Running"
  },
  {
    "dayOfYear": 68,
    "dateKey": "03-09",
    "question": "What sport is played at Northwestern's Welsh-Ryan Arena? (edition 2)",
    "answer": "Basketball (and volleyball)",
    "category": "College"
  },
  {
    "dayOfYear": 69,
    "dateKey": "03-10",
    "question": "The Blackhawks' home jersey features which animal? (edition 2)",
    "answer": "Native American-inspired hawk logo",
    "category": "Hockey"
  },
  {
    "dayOfYear": 70,
    "dateKey": "03-11",
    "question": "Ditka coached which NFL franchise? (edition 2)",
    "answer": "Chicago Bears",
    "category": "Football"
  },
  {
    "dayOfYear": 71,
    "dateKey": "03-12",
    "question": "How many bases are on a baseball diamond? (edition 2)",
    "answer": "Four",
    "category": "Baseball"
  },
  {
    "dayOfYear": 72,
    "dateKey": "03-13",
    "question": "A football field is how many yards long (goal to goal)? (edition 2)",
    "answer": "100 yards",
    "category": "Football"
  },
  {
    "dayOfYear": 73,
    "dateKey": "03-14",
    "question": "How many players on the court for one NBA team? (edition 2)",
    "answer": "Five",
    "category": "Basketball"
  },
  {
    "dayOfYear": 74,
    "dateKey": "03-15",
    "question": "Hockey uses a puck made primarily of what? (edition 2)",
    "answer": "Vulcanized rubber",
    "category": "Hockey"
  },
  {
    "dayOfYear": 75,
    "dateKey": "03-16",
    "question": "What does RBI stand for? (edition 2)",
    "answer": "Runs Batted In",
    "category": "Baseball"
  },
  {
    "dayOfYear": 76,
    "dateKey": "03-17",
    "question": "What is a hat trick in hockey? (edition 2)",
    "answer": "Three goals by one player in a game",
    "category": "Hockey"
  },
  {
    "dayOfYear": 77,
    "dateKey": "03-18",
    "question": "March Madness refers to which sport? (edition 2)",
    "answer": "College basketball",
    "category": "Basketball"
  },
  {
    "dayOfYear": 78,
    "dateKey": "03-19",
    "question": "The Heisman Trophy is awarded in which sport? (edition 2)",
    "answer": "College football",
    "category": "Football"
  },
  {
    "dayOfYear": 79,
    "dateKey": "03-20",
    "question": "What is the distance of a regulation marathon? (edition 2)",
    "answer": "26.2 miles",
    "category": "Running"
  },
  {
    "dayOfYear": 80,
    "dateKey": "03-21",
    "question": "Olympic swimming pools are how many meters long? (edition 2)",
    "answer": "50 meters",
    "category": "Swimming"
  },
  {
    "dayOfYear": 81,
    "dateKey": "03-22",
    "question": "In tennis, what comes after deuce if a player scores? (edition 2)",
    "answer": "Advantage",
    "category": "Tennis"
  },
  {
    "dayOfYear": 82,
    "dateKey": "03-23",
    "question": "How many holes in a standard golf round? (edition 2)",
    "answer": "18",
    "category": "Golf"
  },
  {
    "dayOfYear": 83,
    "dateKey": "03-24",
    "question": "What color flag ends a NASCAR race? (edition 2)",
    "answer": "Checkered",
    "category": "Auto"
  },
  {
    "dayOfYear": 84,
    "dateKey": "03-25",
    "question": "FIFA World Cup is contested in which sport? (edition 2)",
    "answer": "Soccer (football)",
    "category": "Soccer"
  },
  {
    "dayOfYear": 85,
    "dateKey": "03-26",
    "question": "A strikeout is recorded how in a scorebook often? (edition 2)",
    "answer": "K",
    "category": "Baseball"
  },
  {
    "dayOfYear": 86,
    "dateKey": "03-27",
    "question": "Who holds the NBA career scoring record (as of mid-2020s)? (edition 2)",
    "answer": "LeBron James",
    "category": "Basketball"
  },
  {
    "dayOfYear": 87,
    "dateKey": "03-28",
    "question": "Green Bay Packers are rivals of which Chicago team? (edition 2)",
    "answer": "Chicago Bears",
    "category": "Football"
  },
  {
    "dayOfYear": 88,
    "dateKey": "03-29",
    "question": "What is the oldest continuously operating MLB park? (edition 2)",
    "answer": "Fenway or Wrigley (Wrigley 1914, Fenway 1912)",
    "category": "Baseball"
  },
  {
    "dayOfYear": 89,
    "dateKey": "03-30",
    "question": "Northwestern University is in which Illinois city? (edition 2)",
    "answer": "Evanston",
    "category": "Local"
  },
  {
    "dayOfYear": 90,
    "dateKey": "03-31",
    "question": "The Chicago Fire play which sport? (edition 2)",
    "answer": "MLS soccer",
    "category": "Soccer"
  },
  {
    "dayOfYear": 91,
    "dateKey": "04-01",
    "question": "What river was famously reversed in Chicago? (edition 2)",
    "answer": "Chicago River",
    "category": "Local"
  },
  {
    "dayOfYear": 92,
    "dateKey": "04-02",
    "question": "Soldier Field sits near which museum campus landmark? (edition 2)",
    "answer": "Field Museum / Adler / Shedd area",
    "category": "Local"
  },
  {
    "dayOfYear": 93,
    "dateKey": "04-03",
    "question": "Who was known as \"The Fridge\" for the Bears? (edition 2)",
    "answer": "William Perry",
    "category": "Football"
  },
  {
    "dayOfYear": 94,
    "dateKey": "04-04",
    "question": "Scottie Pippen was Jordan's teammate on which team? (edition 2)",
    "answer": "Chicago Bulls",
    "category": "Basketball"
  },
  {
    "dayOfYear": 95,
    "dateKey": "04-05",
    "question": "What is icing in hockey? (edition 2)",
    "answer": "Shooting the puck from behind center across the opposing goal line",
    "category": "Hockey"
  },
  {
    "dayOfYear": 96,
    "dateKey": "04-06",
    "question": "A perfect game in baseball means? (edition 2)",
    "answer": "No opposing batter reaches base",
    "category": "Baseball"
  },
  {
    "dayOfYear": 97,
    "dateKey": "04-07",
    "question": "How many points is a free throw worth? (edition 2)",
    "answer": "One",
    "category": "Basketball"
  },
  {
    "dayOfYear": 98,
    "dateKey": "04-08",
    "question": "What is the NFL championship game called? (edition 2)",
    "answer": "Super Bowl",
    "category": "Football"
  },
  {
    "dayOfYear": 99,
    "dateKey": "04-09",
    "question": "Stanley Cup belongs to which league? (edition 2)",
    "answer": "NHL",
    "category": "Hockey"
  },
  {
    "dayOfYear": 100,
    "dateKey": "04-10",
    "question": "World Series belongs to which league? (edition 2)",
    "answer": "MLB",
    "category": "Baseball"
  }
];
