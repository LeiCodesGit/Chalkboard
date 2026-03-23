import Syllabus from '../../models/Syllabus/syllabus.js';
import CourseOutcomes from '../../models/Syllabus/courseOutcomes.js';
import CourseMapping from '../../models/Syllabus/courseMapping.js';
import WeeklySchedule from '../../models/Syllabus/weeklySchedule.js';
import ProgramEducationalObjectives from '../../models/Syllabus/programEducationObjectives.js';
import StudentEducationalObjectives from '../../models/Syllabus/studentEducationalObjectives.js';
import CourseEvaluationPerCO from '../../models/Syllabus/courseEvaluationPerCO.js';
import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';
import puppeteer from 'puppeteer';
import ejs from 'ejs';
import fs from 'fs';
import path, { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function generateSyllabusPdf(req, res) {
    try {
        const { syllabusId } = req.params;
        const syl = await Syllabus.findById(syllabusId).populate('assignedInstructor');
        
        if (!syl) {
            return res.status(404).send('Syllabus not found');
        }

        // Fetch all related data
        const [
            outcomesList,
            mappingsList,
            approval,
            peosDoc,
            sosDoc,
            schedulesList,
            evaluationsList
        ] = await Promise.all([
            CourseOutcomes.find({ syllabusID: syllabusId }),
            CourseMapping.find({ syllabusID: syllabusId }),
            SyllabusApprovalStatus.findOne({ syllabusID: syllabusId }),
            ProgramEducationalObjectives.findOne({ syllabusID: syllabusId }),
            StudentEducationalObjectives.findOne({ syllabusID: syllabusId }),
            WeeklySchedule.find({ syllabusID: syllabusId }).sort({ week: 1 }),
            CourseEvaluationPerCO.find({ syllabusID: syllabusId })
        ]);

        // Data processing (matching previewRoutes.js logic)
        const mappedOutcomes = outcomesList.map(co => {
            const obj = co.toObject();
            return {
                ...obj,
                statement: (obj.description && obj.description.length > 0) ? obj.description[0] : '',
                thinkingSkills: (obj.thinkingSkills && obj.thinkingSkills.length > 0) ? obj.thinkingSkills[0] : ''
            };
        });

        const mapping = mappingsList.map(m => {
            const obj = m.toObject();
            if (Array.isArray(obj.fromAtoL)) {
                const letters = ['a','b','c','d','e','f','g','h','i','j','k','l'];
                const mapped = {};
                letters.forEach((l, idx) => {
                    mapped[l] = obj.fromAtoL[idx] || '';
                });
                obj.fromAtoL = mapped;
            }
            return obj;
        });

        const schedules = schedulesList.map(s => s.toObject());
        const evaluation = evaluationsList.map(e => e.toObject());
        const peos = peosDoc ? peosDoc.toObject() : { description: [], rating: [] };
        const sos = sosDoc ? sosDoc.toObject() : { description: [], rating: [] };

        // Read Logo and convert to Base64 for Puppeteer Header
        const logoPath = join(__dirname, '../../public/Syllabus/img/mcm.png');
        let logoBase64 = '';
        try {
            logoBase64 = fs.readFileSync(logoPath).toString('base64');
        } catch (e) {
            console.error('Logo not found at:', logoPath);
        }

        // Render EJS to HTML
        const templatePath = join(__dirname, '../../views/Syllabus/syllabusPdfTemplate.ejs');
        const html = await ejs.renderFile(templatePath, {
            syllabusId,
            courseCode: syl.courseCode || '',
            courseTitle: syl.courseTitle || '',
            syl: syl.toObject(),
            outcomes: mappedOutcomes,
            mapping: mapping,
            peos: peos,
            sos: sos,
            schedules: schedules,
            evaluation: evaluation,
            status: approval ? approval.status : 'Not Submitted',
            approval: approval ? approval.toObject() : null
        });

        // Use Puppeteer to generate PDF
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        // Format submission date based on approval record
        let submissionDate = 'N/A';
        if (approval && approval.createdAt) {
            const d = new Date(approval.createdAt);
            submissionDate = (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
        } else {
            const d = new Date();
            submissionDate = (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
        }

        // Define Header Template
        const headerTemplate = `
            <div style="font-family: Arial, sans-serif; font-size: 8pt; width: 100%; margin: 0 15mm; border-bottom: 1px solid #000; padding-bottom: 5px; display: flex; align-items: flex-start; justify-content: space-between;">
                <div style="display: flex; align-items: center;">
                    <img src="data:image/png;base64,${logoBase64}" style="height: 45px; margin-right: 10px;">
                </div>
                <div style="text-align: right;">
                    <table style="border-collapse: collapse; border: 1px solid #000; font-size: 7pt;">
                        <tr><td style="border: 1px solid #000; padding: 2px;">REVISION NO.:</td><td style="border: 1px solid #000; padding: 2px; width: 40px; text-align: center;">00</td></tr>
                        <tr><td style="border: 1px solid #000; padding: 2px;">REVISION DATE:</td><td style="border: 1px solid #000; padding: 2px; width: 40px; text-align: center;">${submissionDate}</td></tr>
                    </table>
                </div>
            </div>
        `;

        // Define Footer Template
        const preparedBy = syl.assignedInstructor ? (syl.assignedInstructor.firstName + ' ' + syl.assignedInstructor.lastName) : 'Faculty';
        const approvedBy = (approval && approval.PC_SignatoryName) ? approval.PC_SignatoryName : 'Program Chair';
        
        const footerTemplate = `
            <div style="font-family: Arial, sans-serif; font-size: 7pt; width: 100%; margin: 0 15mm 10px 15mm;">
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 2px;">
                    <tr style="text-align: center; background-color: #f2f2f2; font-weight: bold;">
                        <td style="border: 1px solid #000; width: 30%;">COURSE TITLE</td>
                        <td style="border: 1px solid #000; width: 15%;">AY/TERM</td>
                        <td style="border: 1px solid #000; width: 25%;">PREPARED BY</td>
                        <td style="border: 1px solid #000; width: 20%;">APPROVED BY</td>
                        <td style="border: 1px solid #000; width: 10%;">PAGE</td>
                    </tr>
                    <tr style="text-align: center;">
                        <td style="border: 1px solid #000;">${syl.courseTitle}</td>
                        <td style="border: 1px solid #000;">${syl.schoolYear || ''} / ${syl.term || ''}</td>
                        <td style="border: 1px solid #000;">${preparedBy}</td>
                        <td style="border: 1px solid #000;">${approvedBy}</td>
                        <td style="border: 1px solid #000;"><span class="pageNumber"></span> OF <span class="totalPages"></span></td>
                    </tr>
                </table>
                <div style="text-align: right; font-weight: bold;">FORM OVPAA</div>
            </div>
        `;

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: headerTemplate,
            footerTemplate: footerTemplate,
            margin: {
                top: '35mm',
                bottom: '35mm',
                left: '15mm',
                right: '15mm'
            }
        });

        await browser.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="Syllabus_' + (syl.courseCode || 'Draft') + '.pdf"',
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);

    } catch (err) {
        console.error('PDF Generation Error:', err);
        res.status(500).send('Error generating syllabus PDF: ' + err.message);
    }
}
