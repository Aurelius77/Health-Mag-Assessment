A health companion app.

#STACK = Created with NextJs, Typescrpt, TailwindCSS, NodeJS and Supabase

##WORKFLOW
The app takes data from the provided health content and pdigin translations document and seeded them into a supabase db(seed.ts, seed.sql), from which it is then imported and used in the application

And then there's now an admin page which can be accessed by a generated token to use and update the current database and it's content wuthout need of technical know-how or rewriting the codebase.
The script that takes the messy and data filled wirh erros and mistakes(clean.ts) takes the data and cleans it up, it's functions looks out for text filled with entities and code, such as html tags and replaces them with clean texrt, it looks out for misspelled article topics and labels and cleans them up to the correct format based on the available data, it also normalizes the status of the article whteher published or unknown, it also uses string slugs from some artciles to give them topics that mihht be missing from some artcicles.

The supabase schema(schema.sql) creates the different tables for the datasets, the lanuagages, the topics, articles and articles translations, which then has the rows inserted in from the seeded data(from the available data from the csvs) to populate the db and get it working

Content.ts then fetches these tables with articles/topics/langauages from supabase, so for each article you get it's topic, it's language and translation. But some articles lack translations, so if users requests for one, it silently fails and falls back to the available language while showing a user oriented error such as "this language is't avaulable". It lists out the different aricles, to[pics, their leaguages] and saves the data for the pages to use

#DATA PRESENTATION#: the layout.tsx page holds all the UI content together. The homepage takes the data from content and displays and fetches it on the page for the user, there's search box and a togle to switch the languages available for thr articles

The admin page requires the admin to sign in with a pre-generated token(I think best for me to keep this to the meeting since it's a public repo so random access and data distortion won't happen to the available data), from where the user can access and make edits, add new data and artciels to the current data without needing much technical know how

There is also an AI assistant that helps user clear up doubts, ansswr simple questions and simplify texts for them. It uses the GEMINI API MODEL and it's hsoted in ai.ts and ask/route.ts

#ARCHITECTURE
So the architecture is NextjS(Typescript), Nodejs and supabase. I used this cause it keeps things simple while effectively working. Supabase is easy to setup and connect especially for a small level applicatoion. It also keeps the data and makes it a consistent source of truth. Also easy to enable admiin path that can simply push new data there easily. NodeJS to build the APIs and backend for easy frontend connection and data managament and app workflow and architecture. Typescript also keeps the frontend clean ans using types makes it easy to know waht sort of data to expect with the app especially for sources that may have data content that could easily break the app if not well handled

#AI USAGE
I used Claude Code to help build this. It helped speed up development time and also helped out with the bit more complex parts such as the data cleaning and parsing, the data content flow through the application and connecting the languages and article with easy switching and fallbacks. i had to correct it a few times especially with the method of admin data seeding and management to try and make it as non-technical as possible to manage new data

#EXTRA FEATURES
Some extra features I would add with more time would be things like data sourcing, so with the use of AI assistant, users can use it to research and find other online articles related to the source topic for further reading and evidence backing

Another one is automatic translation. This way data content that are missing out on translations can have an AI feature on the article to automatically translate to lanuage of their choosing with use of the AI translation feature

THANK YOU FOR TRYING OUT MY APPLICATION
