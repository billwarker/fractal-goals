# Implementation Doc

# Current State

The fractal-goals web application has the following components:
- Backend (FastAPI)
- Frontend (React)
- Database (SQLite)

I want to now improve the architecture of the application to use Flask to display the following new pages in the frontend:

- Fractal Goal Selection Page (/selection)
- Goals View -> Flow Tree View in ReactJS (/fractal-goals)
- Sessions View -> New Feature using ReactJS, displays information about practice sessions from the database. Attached to goals at a variety of levels. (/sessions)
- Log Session -> New Feature to add practice sessions to the database (/log)
- Programming -> New Feature to create composable fractal practice session templates using an interfrace that builds a JSON data struture that can be used to create practice sessions in the database (/programming)

