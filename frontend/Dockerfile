FROM node:alpine as build

WORKDIR /app
COPY . .
RUN yarn
ENV BODY_SIZE_LIMIT=0
RUN yarn build
RUN ls -al

FROM node:alpine as production

ENV BODY_SIZE_LIMIT=0

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/build/ ./
RUN yarn --production
EXPOSE 3000
CMD [ "node",  "index.js"]