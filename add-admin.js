
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const email = process.argv[2]
    if (!email) {
        console.error('Please provide an email: node add-admin.js email@example.com')
        process.exit(1)
    }

    const user = await prisma.user.upsert({
        where: { email },
        update: { role: 'OPERATIONS' },
        create: {
            email,
            fullName: 'Admin User',
            phone: '',
            role: 'OPERATIONS'
        }
    })

    console.log(`User ${email} is now an ADMIN.`)
    console.log(JSON.stringify(user, null, 2))
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
