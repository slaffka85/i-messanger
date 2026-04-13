# Build Stage
FROM openjdk:26-ea-jdk-slim as build
WORKDIR /app

# Install Maven
RUN apt-get update && apt-get install -y maven && rm -rf /var/lib/apt/lists/*

# 1. Сначала копируем только файлы описания проекта (pom.xml)
COPY pom.xml .
COPY server/pom.xml server/

# 2. Скачиваем зависимости. Этот слой закешируется и не будет перекачиваться,
# пока вы не измените что-то в pom.xml
RUN mvn -f server/pom.xml dependency:go-offline -B

# 3. Теперь копируем исходный код
COPY server/src server/src/

# 4. Собираем проект. Теперь это будет ОЧЕНЬ быстро, так как зависимости уже в слое.
RUN mvn -f server/pom.xml clean package -DskipTests

# Runtime Stage
FROM openjdk:26-ea-jdk-slim
WORKDIR /app
COPY --from=build /app/server/target/*.jar app.jar
ENV SPRING_PROFILES_ACTIVE=prod
EXPOSE 8080
ENTRYPOINT ["java", "--enable-preview", "-jar", "app.jar"]
